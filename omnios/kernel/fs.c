/* OmniFS: an in-memory hierarchical filesystem with Unix-style ownership. */
#include "omnios.h"

static fnode *root;

static fnode *mknode(const char *name, int dir, uint32_t uid, uint16_t mode)
{
    fnode *n = kzalloc(sizeof *n);
    strncpy0(n->name, name, sizeof n->name);
    n->is_dir = dir;
    n->uid = uid;
    n->mode = mode;
    n->mtime = ticks();
    return n;
}

static void attach(fnode *parent, fnode *n)
{
    n->parent = parent;
    fnode **pp = &parent->child;           /* keep children sorted by name */
    while (*pp && strcmp((*pp)->name, n->name) < 0) pp = &(*pp)->next;
    n->next = *pp;
    *pp = n;
}

static void detach(fnode *n)
{
    fnode **pp = &n->parent->child;
    while (*pp && *pp != n) pp = &(*pp)->next;
    if (*pp) *pp = n->next;
    n->parent = NULL;
    n->next = NULL;
}

fnode *fs_root(void) { return root; }

static fnode *child(fnode *dir, const char *name, size_t len)
{
    if (len == 1 && name[0] == '.') return dir;
    if (len == 2 && name[0] == '.' && name[1] == '.') return dir->parent ? dir->parent : dir;
    for (fnode *c = dir->child; c; c = c->next)
        if (strlen(c->name) == len && !strncmp(c->name, name, len)) return c;
    return NULL;
}

fnode *fs_lookup(fnode *cwd, const char *path)
{
    fnode *n = (path[0] == '/' || !cwd) ? root : cwd;
    while (*path) {
        while (*path == '/') path++;
        if (!*path) break;
        const char *e = path;
        while (*e && *e != '/') e++;
        if (!n->is_dir) return NULL;
        n = child(n, path, (size_t)(e - path));
        if (!n) return NULL;
        path = e;
    }
    return n;
}

/* Split "a/b/c" into the parent directory node and the final name. */
static fnode *split(fnode *cwd, const char *path, char *name, const char **err)
{
    char buf[256];
    strncpy0(buf, path, sizeof buf);
    size_t l = strlen(buf);
    while (l > 1 && buf[l - 1] == '/') buf[--l] = 0;
    char *slash = NULL;
    for (char *p = buf; *p; p++) if (*p == '/') slash = p;
    fnode *dir;
    if (!slash) { dir = cwd; strncpy0(name, buf, 64); }
    else {
        strncpy0(name, slash + 1, 64);
        *slash = 0;
        dir = fs_lookup(cwd, slash == buf ? "/" : buf);
    }
    if (!dir || !dir->is_dir) { *err = "no such directory"; return NULL; }
    if (!name[0] || !strcmp(name, ".") || !strcmp(name, "..")) { *err = "invalid name"; return NULL; }
    return dir;
}

fnode *fs_create(fnode *cwd, const char *path, int is_dir, uint32_t uid, uint16_t mode, const char **err)
{
    char name[64];
    fnode *dir = split(cwd, path, name, err);
    if (!dir) return NULL;
    if (child(dir, name, strlen(name))) { *err = "already exists"; return NULL; }
    if (!fs_can_write(dir, uid)) { *err = "permission denied"; return NULL; }
    fnode *n = mknode(name, is_dir, uid, mode);
    attach(dir, n);
    dir->mtime = ticks();
    return n;
}

int fs_write(fnode *f, const char *buf, size_t n, int append)
{
    if (f->is_dir) return -1;
    size_t need = (append ? f->size : 0) + n;
    if (need + 1 > f->cap) {
        size_t cap = f->cap ? f->cap : 64;
        while (cap < need + 1) cap *= 2;
        char *d = krealloc(f->data, cap);
        if (!d) return -1;
        f->data = d;
        f->cap = cap;
    }
    if (!append) f->size = 0;
    memcpy(f->data + f->size, buf, n);
    f->size += n;
    f->data[f->size] = 0;
    f->mtime = ticks();
    return 0;
}

static void destroy(fnode *n)
{
    while (n->child) { fnode *c = n->child; n->child = c->next; destroy(c); }
    kfree(n->data);
    kfree(n);
}

int fs_remove(fnode *n)
{
    if (n == root) return -1;
    detach(n);
    destroy(n);
    return 0;
}

int fs_move(fnode *f, fnode *cwd, const char *dest, const char **err)
{
    if (f == root) { *err = "cannot move /"; return -1; }
    fnode *d = fs_lookup(cwd, dest);
    char name[64];
    fnode *dir;
    if (d && d->is_dir) { dir = d; strcpy(name, f->name); }
    else if (d) { *err = "destination exists"; return -1; }
    else if (!(dir = split(cwd, dest, name, err))) return -1;
    for (fnode *p = dir; p; p = p->parent)
        if (p == f) { *err = "cannot move a directory into itself"; return -1; }
    if (child(dir, name, strlen(name))) { *err = "destination exists"; return -1; }
    detach(f);
    strcpy(f->name, name);
    attach(dir, f);
    return 0;
}

void fs_path(fnode *n, char *out, size_t cap)
{
    if (n == root) { strncpy0(out, "/", cap); return; }
    char tmp[512] = "";
    for (; n && n != root; n = n->parent) {
        char seg[512];
        ksnprintf(seg, sizeof seg, "/%s%s", n->name, tmp);
        strncpy0(tmp, seg, sizeof tmp);
    }
    strncpy0(out, tmp, cap);
}

int fs_can_read(fnode *n, uint32_t uid)  { return uid == 0 || (n->uid == uid ? n->mode & P_UR : n->mode & P_OR); }
int fs_can_write(fnode *n, uint32_t uid) { return uid == 0 || (n->uid == uid ? n->mode & P_UW : n->mode & P_OW); }
int fs_can_enter(fnode *n, uint32_t uid) { return uid == 0 || (n->uid == uid ? n->mode & P_UX : n->mode & P_OX); }

size_t fs_count(fnode *n, size_t *bytes)
{
    size_t c = 1;
    *bytes += n->size;
    for (fnode *k = n->child; k; k = k->next) c += fs_count(k, bytes);
    return c;
}

static void file(const char *path, uint32_t uid, uint16_t mode, const char *text)
{
    const char *err;
    fnode *f = fs_create(root, path, 0, 0, mode, &err);
    if (!f) return;
    f->uid = uid;
    fs_write(f, text, strlen(text), 0);
}

static void dir(const char *path, uint32_t uid, uint16_t mode)
{
    const char *err;
    fnode *d = fs_create(root, path, 1, 0, mode, &err);
    if (d) d->uid = uid;
}

void fs_init(void)
{
    root = mknode("", 1, 0, 0755);
    dir("/bin", 0, 0755);
    dir("/etc", 0, 0755);
    dir("/home", 0, 0755);
    dir("/home/omni", 1000, 0755);
    dir("/home/omni/Documents", 1000, 0755);
    dir("/root", 0, 0700);
    dir("/tmp", 0, 0777);
    file("/etc/motd", 0, 0644,
         "Welcome to OmniOS - the operating system built from scratch.\n"
         "Type 'help' to see every command. Type 'su' to become root.\n");
    file("/etc/hostname", 0, 0644, "omnios\n");
    file("/etc/os-release", 0, 0644,
         "NAME=OmniOS\nVERSION=" OMNIOS_VERSION "\nKERNEL=omni (x86_64, from scratch)\n");
    file("/root/secret.txt", 0, 0600, "Only root can read this file.\n");
    file("/home/omni/readme.txt", 1000, 0644,
         "This is your home folder. Files live in RAM in this release.\n"
         "Try: write notes.txt   then   cat notes.txt\n");
}
