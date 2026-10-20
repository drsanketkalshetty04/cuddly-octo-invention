/* omsh - the OmniOS shell: line editing, history, tab completion,
 * redirection (> >>), command chaining (;), users, su/sudo and root. */
#include "omnios.h"

#define LINE 256
#define HIST 32
#define MAXARGS 32
#define CAPTURE (64 * 1024)

typedef struct { char name[32]; char pass[32]; uint32_t uid; char home[64]; int sudoer; } user_t;

static user_t users[16] = {
    { "root", "root", 0,    "/root",      1 },
    { "omni", "omni", 1000, "/home/omni", 1 },
};
static int nusers = 2;
static int ustack[8];       /* stack of user indices, for su / exit */
static int udepth;
static fnode *cwd;
static char hist[HIST][LINE];
static int nhist;
static int last_status;

static user_t *me(void) { return &users[ustack[udepth]]; }
static uint32_t uid(void) { return me()->uid; }

static void err(const char *cmd, const char *msg) { console_color(COL_LRED, COL_BLACK); kprintf("%s: %s\n", cmd, msg); console_color(COL_GREY, COL_BLACK); }

static user_t *find_user(const char *name)
{
    for (int i = 0; i < nusers; i++) if (!strcmp(users[i].name, name)) return &users[i];
    return NULL;
}

/* ------------------------------------------------------------------ */
/* Line editor                                                         */

typedef struct cmd { const char *name; int (*fn)(int, char **); const char *help; } cmd_t;
static const cmd_t cmds[];

static void redraw(const char *buf, size_t len, size_t old)
{
    for (size_t i = 0; i < old; i++) kprintf("\b \b");
    console_write(buf, len);
}

static size_t readline(char *buf, size_t cap, int secret)
{
    size_t len = 0;
    int h = nhist;
    for (;;) {
        int c = getchar_block();
        if (c == '\n') { kprintf("\n"); buf[len] = 0; return len; }
        if (c == '\b') { if (len) { len--; kprintf("\b \b"); } continue; }
        if (c == 3) { kprintf("^C\n"); buf[0] = 0; return 0; }                 /* Ctrl+C */
        if (c == 12 && !secret) { console_clear(); return (size_t)-1; }         /* Ctrl+L */
        if ((c == KEY_UP || c == KEY_DOWN) && !secret) {
            if (c == KEY_UP && h > 0) h--;
            else if (c == KEY_DOWN && h < nhist) h++;
            else continue;
            size_t old = len;
            strncpy0(buf, h < nhist ? hist[h % HIST] : "", cap);
            len = strlen(buf);
            redraw(buf, len, old);
            continue;
        }
        if (c == '\t' && !secret) {                                              /* complete command */
            if (strchr(buf, ' ') && len) continue;
            buf[len] = 0;
            const char *match = NULL; int count = 0;
            for (const cmd_t *k = cmds; k->name; k++)
                if (!strncmp(k->name, buf, len)) { match = k->name; count++; }
            if (count == 1) {
                size_t old = len;
                strncpy0(buf, match, cap);
                len = strlen(buf);
                if (len + 1 < cap) buf[len++] = ' ';
                redraw(buf, len, old);
            }
            else if (count > 1) {
                kprintf("\n");
                for (const cmd_t *k = cmds; k->name; k++) if (!strncmp(k->name, buf, len)) kprintf("%s  ", k->name);
                kprintf("\n");
                return (size_t)-1;
            }
            continue;
        }
        if (c < 32 || c > 126 || len + 1 >= cap) continue;
        buf[len++] = (char)c;
        console_putc(secret ? '*' : (char)c);
    }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */

static fnode *need(const char *cmd, const char *path)
{
    fnode *n = fs_lookup(cwd, path);
    if (!n) { char m[300]; ksnprintf(m, sizeof m, "%s: no such file or directory", path); err(cmd, m); }
    return n;
}

static void mode_str(fnode *n, char *s)
{
    s[0] = n->is_dir ? 'd' : '-';
    const char *rwx = "rwx";
    for (int i = 0; i < 3; i++) s[1 + i] = (n->mode & (0400 >> i)) ? rwx[i] : '-';
    s[4] = '-'; s[5] = '-'; s[6] = '-';  /* no groups */
    for (int i = 0; i < 3; i++) s[7 + i] = (n->mode & (04 >> i)) ? rwx[i] : '-';
    s[10] = 0;
}

static const char *uname_of(uint32_t id)
{
    for (int i = 0; i < nusers; i++) if (users[i].uid == id) return users[i].name;
    return "?";
}

static int check_password(user_t *u)
{
    if (uid() == 0) return 1;
    char pw[32];
    kprintf("Password for %s: ", u->name);
    readline(pw, sizeof pw, 1);
    if (strcmp(pw, u->pass)) { err("auth", "incorrect password"); return 0; }
    return 1;
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */

static int run_line(char *line);

static int c_help(int argc, char **argv)
{
    (void)argc; (void)argv;
    console_color(COL_LCYAN, COL_BLACK);
    kprintf("OmniOS commands  (Tab completes, Up/Down = history, ; chains, > >> redirect)\n");
    console_color(COL_GREY, COL_BLACK);
    for (const cmd_t *k = cmds; k->name; k++) kprintf("  %-10s %s\n", k->name, k->help);
    return 0;
}

static int c_clear(int argc, char **argv) { (void)argc; (void)argv; console_clear(); return 0; }

static int c_echo(int argc, char **argv)
{
    for (int i = 1; i < argc; i++) kprintf(i > 1 ? " %s" : "%s", argv[i]);
    kprintf("\n");
    return 0;
}

static int c_pwd(int argc, char **argv) { (void)argc; (void)argv; char p[512]; fs_path(cwd, p, sizeof p); kprintf("%s\n", p); return 0; }

static int c_cd(int argc, char **argv)
{
    fnode *n = need("cd", argc > 1 ? argv[1] : me()->home);
    if (!n) return 1;
    if (!n->is_dir) { err("cd", "not a directory"); return 1; }
    if (!fs_can_enter(n, uid())) { err("cd", "permission denied"); return 1; }
    cwd = n;
    return 0;
}

static int c_ls(int argc, char **argv)
{
    int lng = 0, all = 0; const char *path = ".";
    for (int i = 1; i < argc; i++) {
        if (argv[i][0] == '-') { if (strchr(argv[i], 'l')) lng = 1; if (strchr(argv[i], 'a')) all = 1; }
        else path = argv[i];
    }
    fnode *d = need("ls", path);
    if (!d) return 1;
    if (d->is_dir && !fs_can_read(d, uid())) { err("ls", "permission denied"); return 1; }
    fnode one = *d; one.next = NULL;
    fnode *list = d->is_dir ? d->child : &one;
    if (all && d->is_dir) kprintf(lng ? "drwx------ .\ndrwx------ ..\n" : ".  ..  ");
    for (fnode *c = list; c; c = c->next) {
        if (lng) {
            char m[11]; mode_str(c, m);
            kprintf("%s %-6s %8lu  ", m, uname_of(c->uid), (uint64_t)c->size);
        }
        console_color(c->is_dir ? COL_LBLUE : COL_GREY, COL_BLACK);
        kprintf("%s%s", c->name, c->is_dir ? "/" : "");
        console_color(COL_GREY, COL_BLACK);
        kprintf(lng ? "\n" : "  ");
    }
    if (!lng && list) kprintf("\n");
    return 0;
}

static void tree(fnode *n, int depth)
{
    for (fnode *c = n->child; c; c = c->next) {
        for (int i = 0; i < depth; i++) kprintf("|   ");
        kprintf("|-- ");
        console_color(c->is_dir ? COL_LBLUE : COL_GREY, COL_BLACK);
        kprintf("%s\n", c->name);
        console_color(COL_GREY, COL_BLACK);
        if (c->is_dir && fs_can_read(c, uid())) tree(c, depth + 1);
    }
}

static int c_tree(int argc, char **argv)
{
    fnode *d = need("tree", argc > 1 ? argv[1] : ".");
    if (!d) return 1;
    char p[512]; fs_path(d, p, sizeof p);
    kprintf("%s\n", p);
    tree(d, 0);
    return 0;
}

static int c_mkdir(int argc, char **argv)
{
    if (argc < 2) { err("mkdir", "usage: mkdir <dir>..."); return 1; }
    int rc = 0;
    for (int i = 1; i < argc; i++) {
        const char *e;
        if (!fs_create(cwd, argv[i], 1, uid(), 0755, &e)) { err("mkdir", e); rc = 1; }
    }
    return rc;
}

static int c_touch(int argc, char **argv)
{
    if (argc < 2) { err("touch", "usage: touch <file>..."); return 1; }
    int rc = 0;
    for (int i = 1; i < argc; i++) {
        fnode *f = fs_lookup(cwd, argv[i]);
        const char *e;
        if (f) f->mtime = ticks();
        else if (!fs_create(cwd, argv[i], 0, uid(), 0644, &e)) { err("touch", e); rc = 1; }
    }
    return rc;
}

static int c_cat(int argc, char **argv)
{
    if (argc < 2) { err("cat", "usage: cat <file>..."); return 1; }
    for (int i = 1; i < argc; i++) {
        fnode *f = need("cat", argv[i]);
        if (!f) return 1;
        if (f->is_dir) { err("cat", "is a directory"); return 1; }
        if (!fs_can_read(f, uid())) { err("cat", "permission denied"); return 1; }
        if (f->size) console_write(f->data, f->size);
    }
    return 0;
}

static int c_rm(int argc, char **argv)
{
    int rec = 0, rc = 0;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "-r") || !strcmp(argv[i], "-rf")) { rec = 1; continue; }
        fnode *f = need("rm", argv[i]);
        if (!f) { rc = 1; continue; }
        if (f == fs_root()) { err("rm", "refusing to remove /"); rc = 1; continue; }
        if (f->is_dir && f->child && !rec) { err("rm", "directory not empty (use -r)"); rc = 1; continue; }
        if (!fs_can_write(f->parent, uid())) { err("rm", "permission denied"); rc = 1; continue; }
        for (fnode *p = cwd; p; p = p->parent) if (p == f) cwd = f->parent;
        fs_remove(f);
    }
    return rc;
}

static int c_mv(int argc, char **argv)
{
    if (argc < 3) { err("mv", "usage: mv <src> <dest>"); return 1; }
    fnode *f = need("mv", argv[1]);
    if (!f) return 1;
    if (!fs_can_write(f->parent, uid())) { err("mv", "permission denied"); return 1; }
    const char *e;
    if (fs_move(f, cwd, argv[2], &e)) { err("mv", e); return 1; }
    return 0;
}

static int c_cp(int argc, char **argv)
{
    if (argc < 3) { err("cp", "usage: cp <file> <dest>"); return 1; }
    fnode *f = need("cp", argv[1]);
    if (!f) return 1;
    if (f->is_dir) { err("cp", "copying directories is not supported yet"); return 1; }
    if (!fs_can_read(f, uid())) { err("cp", "permission denied"); return 1; }
    fnode *d = fs_lookup(cwd, argv[2]);
    char path[320];
    if (d && d->is_dir) { char dp[256]; fs_path(d, dp, sizeof dp); ksnprintf(path, sizeof path, "%s/%s", dp, f->name); }
    else strncpy0(path, argv[2], sizeof path);
    fnode *t = fs_lookup(cwd, path);
    const char *e;
    if (t && (t->is_dir || !fs_can_write(t, uid()))) { err("cp", "cannot overwrite destination"); return 1; }
    if (!t && !(t = fs_create(cwd, path, 0, uid(), f->mode, &e))) { err("cp", e); return 1; }
    fs_write(t, f->data ? f->data : "", f->size, 0);
    return 0;
}

static int c_write(int argc, char **argv)
{
    if (argc < 2) { err("write", "usage: write <file>   (type lines, finish with a single '.')"); return 1; }
    fnode *f = fs_lookup(cwd, argv[1]);
    const char *e;
    if (f && (f->is_dir || !fs_can_write(f, uid()))) { err("write", "cannot write that file"); return 1; }
    if (!f && !(f = fs_create(cwd, argv[1], 0, uid(), 0644, &e))) { err("write", e); return 1; }
    console_color(COL_DGREY, COL_BLACK);
    kprintf("-- writing %s: end with a line containing only '.' --\n", argv[1]);
    console_color(COL_GREY, COL_BLACK);
    fs_write(f, "", 0, 0);
    char line[LINE];
    for (;;) {
        size_t n = readline(line, sizeof line, 0);
        if (n == (size_t)-1) continue;
        if (!strcmp(line, ".")) break;
        fs_write(f, line, n, 1);
        fs_write(f, "\n", 1, 1);
    }
    kprintf("saved %lu bytes\n", (uint64_t)f->size);
    return 0;
}

static int c_wc(int argc, char **argv)
{
    if (argc < 2) { err("wc", "usage: wc <file>"); return 1; }
    fnode *f = need("wc", argv[1]);
    if (!f || f->is_dir || !fs_can_read(f, uid())) { if (f) err("wc", "cannot read"); return 1; }
    size_t l = 0, w = 0; int in = 0;
    for (size_t i = 0; i < f->size; i++) {
        char c = f->data[i];
        if (c == '\n') l++;
        if (c == ' ' || c == '\n' || c == '\t') in = 0; else if (!in) { in = 1; w++; }
    }
    kprintf("%lu lines  %lu words  %lu bytes  %s\n", (uint64_t)l, (uint64_t)w, (uint64_t)f->size, argv[1]);
    return 0;
}

static int c_grep(int argc, char **argv)
{
    if (argc < 3) { err("grep", "usage: grep <text> <file>"); return 1; }
    fnode *f = need("grep", argv[2]);
    if (!f || f->is_dir || !fs_can_read(f, uid())) { if (f) err("grep", "cannot read"); return 1; }
    int found = 0;
    char line[LINE];
    for (size_t i = 0; i < f->size;) {
        size_t j = 0;
        while (i < f->size && f->data[i] != '\n') { if (j + 1 < sizeof line) line[j++] = f->data[i]; i++; }
        line[j] = 0; i++;
        if (strstr(line, argv[1])) { kprintf("%s\n", line); found = 1; }
    }
    return !found;
}

static int c_chmod(int argc, char **argv)
{
    if (argc < 3) { err("chmod", "usage: chmod <octal> <path>   e.g. chmod 600 notes.txt"); return 1; }
    fnode *f = need("chmod", argv[2]);
    if (!f) return 1;
    if (uid() != 0 && f->uid != uid()) { err("chmod", "operation not permitted"); return 1; }
    uint16_t m = 0;
    for (const char *p = argv[1]; *p; p++) {
        if (*p < '0' || *p > '7') { err("chmod", "mode must be octal"); return 1; }
        m = (uint16_t)(m * 8 + (*p - '0'));
    }
    f->mode = m & 0777;
    return 0;
}

static int c_chown(int argc, char **argv)
{
    if (argc < 3) { err("chown", "usage: chown <user> <path>"); return 1; }
    if (uid() != 0) { err("chown", "only root can change ownership"); return 1; }
    user_t *u = find_user(argv[1]);
    if (!u) { err("chown", "no such user"); return 1; }
    fnode *f = need("chown", argv[2]);
    if (!f) return 1;
    f->uid = u->uid;
    return 0;
}

static int c_whoami(int argc, char **argv) { (void)argc; (void)argv; kprintf("%s\n", me()->name); return 0; }

static int c_id(int argc, char **argv)
{
    user_t *u = argc > 1 ? find_user(argv[1]) : me();
    if (!u) { err("id", "no such user"); return 1; }
    kprintf("uid=%u(%s)%s\n", u->uid, u->name, u->sudoer ? " groups=sudo" : "");
    return 0;
}

static int c_users(int argc, char **argv)
{
    (void)argc; (void)argv;
    for (int i = 0; i < nusers; i++)
        kprintf("%-10s uid=%-5u home=%s%s\n", users[i].name, users[i].uid, users[i].home,
                users[i].sudoer ? "  [sudo]" : "");
    return 0;
}

static int c_su(int argc, char **argv)
{
    user_t *u = find_user(argc > 1 ? argv[1] : "root");
    if (!u) { err("su", "no such user"); return 1; }
    if (udepth + 1 >= 8) { err("su", "too many nested sessions"); return 1; }
    if (!check_password(u)) return 1;
    ustack[++udepth] = (int)(u - users);
    fnode *h = fs_lookup(NULL, u->home);
    if (h) cwd = h;
    if (u->uid == 0) { console_color(COL_YELLOW, COL_BLACK); kprintf("You are now root. With great power comes great responsibility.\n"); console_color(COL_GREY, COL_BLACK); }
    return 0;
}

static int c_exit(int argc, char **argv)
{
    (void)argc; (void)argv;
    if (udepth == 0) { kprintf("This is the top-level session. Use 'shutdown' or 'reboot'.\n"); return 1; }
    udepth--;
    kprintf("logout\n");
    return 0;
}

static int c_sudo(int argc, char **argv)
{
    if (argc < 2) { err("sudo", "usage: sudo <command...>"); return 1; }
    if (!me()->sudoer) { err("sudo", "user is not in the sudoers list"); return 1; }
    if (!check_password(me())) return 1;
    char line[LINE] = "";
    for (int i = 1; i < argc; i++) {
        size_t l = strlen(line);
        ksnprintf(line + l, sizeof line - l, i > 1 ? " %s" : "%s", argv[i]);
    }
    int saved = ustack[udepth];
    ustack[udepth] = 0;          /* root */
    int rc = run_line(line);
    ustack[udepth] = saved;
    return rc;
}

static int c_useradd(int argc, char **argv)
{
    if (argc < 3) { err("useradd", "usage: useradd <name> <password>"); return 1; }
    if (uid() != 0) { err("useradd", "permission denied (try: sudo useradd ...)"); return 1; }
    if (find_user(argv[1])) { err("useradd", "user exists"); return 1; }
    if (nusers >= 16) { err("useradd", "user table full"); return 1; }
    user_t *u = &users[nusers];
    strncpy0(u->name, argv[1], sizeof u->name);
    strncpy0(u->pass, argv[2], sizeof u->pass);
    u->uid = 1000 + (uint32_t)nusers;
    ksnprintf(u->home, sizeof u->home, "/home/%s", u->name);
    u->sudoer = 0;
    const char *e;
    fnode *h = fs_create(NULL, u->home, 1, 0, 0755, &e);
    if (h) h->uid = u->uid;
    nusers++;
    kprintf("created user %s (uid %u)\n", u->name, u->uid);
    return 0;
}

static int c_passwd(int argc, char **argv)
{
    user_t *u = argc > 1 ? find_user(argv[1]) : me();
    if (!u) { err("passwd", "no such user"); return 1; }
    if (u != me() && uid() != 0) { err("passwd", "permission denied"); return 1; }
    if (!check_password(u)) return 1;
    char a[32], b[32];
    kprintf("New password: "); readline(a, sizeof a, 1);
    kprintf("Retype new password: "); readline(b, sizeof b, 1);
    if (strcmp(a, b) || !a[0]) { err("passwd", "passwords do not match"); return 1; }
    strcpy(u->pass, a);
    kprintf("password updated for %s\n", u->name);
    return 0;
}

static int c_uname(int argc, char **argv)
{
    if (argc > 1 && !strcmp(argv[1], "-a"))
        kprintf("%s omnios %s x86_64 (built " __DATE__ ")\n", OMNIOS_NAME, OMNIOS_VERSION);
    else kprintf("%s\n", OMNIOS_NAME);
    return 0;
}

static void fmt_uptime(char *b, size_t n)
{
    uint64_t s = ticks() / 100;
    ksnprintf(b, n, "%lu h %lu min %lu s", s / 3600, (s / 60) % 60, s % 60);
}

static int c_uptime(int argc, char **argv) { (void)argc; (void)argv; char b[64]; fmt_uptime(b, sizeof b); kprintf("up %s\n", b); return 0; }

static int c_free(int argc, char **argv)
{
    (void)argc; (void)argv;
    kprintf("RAM total : %lu MiB\n", mem_total() >> 20);
    kprintf("Heap size : %lu MiB\n", heap_size() >> 20);
    kprintf("Heap used : %lu KiB\n", heap_used() >> 10);
    return 0;
}

static int c_date(int argc, char **argv)
{
    (void)argc; (void)argv;
    rtc_time t; rtc_read(&t);
    kprintf("%04d-%02d-%02d %02d:%02d:%02d UTC\n", t.year, t.mon, t.day, t.hour, t.min, t.sec);
    return 0;
}

static int c_sysinfo(int argc, char **argv)
{
    (void)argc; (void)argv;
    static const char *logo[] = {
        "   ____                  _ ",
        "  / __ \\____ ___  ____  (_)",
        " / / / / __ `__ \\/ __ \\/ / ",
        "/ /_/ / / / / / / / / / /  ",
        "\\____/_/ /_/ /_/_/ /_/_/   ",
        "        O S                ",
    };
    char cpu[49]; cpu_brand(cpu);
    char up[64]; fmt_uptime(up, sizeof up);
    size_t bytes = 0; size_t nodes = fs_count(fs_root(), &bytes);
    char info[7][96];
    ksnprintf(info[0], 96, "%s@omnios", me()->name);
    ksnprintf(info[1], 96, "OS:      %s %s x86_64", OMNIOS_NAME, OMNIOS_VERSION);
    ksnprintf(info[2], 96, "Kernel:  omni, from scratch (via %s)", boot_loader_name());
    ksnprintf(info[3], 96, "CPU:     %s", cpu);
    ksnprintf(info[4], 96, "Memory:  %lu KiB heap used / %lu MiB RAM", heap_used() >> 10, mem_total() >> 20);
    ksnprintf(info[5], 96, "Uptime:  %s", up);
    ksnprintf(info[6], 96, "Files:   %lu nodes, %lu bytes", (uint64_t)nodes, (uint64_t)bytes);
    for (int i = 0; i < 7; i++) {
        console_color(COL_LCYAN, COL_BLACK);
        kprintf("%-28s", i < 6 ? logo[i] : "");
        console_color(i == 0 ? COL_YELLOW : COL_GREY, COL_BLACK);
        kprintf("%s\n", info[i]);
    }
    console_color(COL_GREY, COL_BLACK);
    return 0;
}

/* calc: recursive-descent integer expression evaluator */
static const char *cp;
static int cerr;
static int64_t expr(void);
static void ws(void) { while (*cp == ' ') cp++; }
static int64_t prim(void)
{
    ws();
    if (*cp == '(') { cp++; int64_t v = expr(); ws(); if (*cp == ')') cp++; else cerr = 1; return v; }
    if (*cp == '-') { cp++; return -prim(); }
    if (*cp < '0' || *cp > '9') { cerr = 1; return 0; }
    int64_t v = 0;
    if (cp[0] == '0' && cp[1] == 'x') {
        cp += 2;
        for (;; cp++) {
            int d = (*cp >= '0' && *cp <= '9') ? *cp - '0' : ((*cp | 32) >= 'a' && (*cp | 32) <= 'f') ? (*cp | 32) - 'a' + 10 : -1;
            if (d < 0) break;
            v = v * 16 + d;
        }
    } else while (*cp >= '0' && *cp <= '9') v = v * 10 + (*cp++ - '0');
    return v;
}
static int64_t term(void)
{
    int64_t v = prim();
    for (;;) {
        ws();
        char op = *cp;
        if (op != '*' && op != '/' && op != '%') return v;
        cp++;
        int64_t r = prim();
        if (op != '*' && r == 0) { cerr = 2; return 0; }
        v = op == '*' ? v * r : op == '/' ? v / r : v % r;
    }
}
static int64_t expr(void)
{
    int64_t v = term();
    for (;;) { ws(); if (*cp == '+') { cp++; v += term(); } else if (*cp == '-') { cp++; v -= term(); } else return v; }
}
static int c_calc(int argc, char **argv)
{
    char line[LINE] = "";
    for (int i = 1; i < argc; i++) { size_t l = strlen(line); ksnprintf(line + l, sizeof line - l, "%s ", argv[i]); }
    if (!line[0]) { err("calc", "usage: calc <expression>   e.g. calc (2+3)*7"); return 1; }
    cp = line; cerr = 0;
    int64_t v = expr(); ws();
    if (cerr == 2) { err("calc", "division by zero"); return 1; }
    if (cerr || *cp) { err("calc", "syntax error"); return 1; }
    kprintf("%ld  (0x%lx)\n", v, (uint64_t)v);
    return 0;
}

static int c_history(int argc, char **argv)
{
    (void)argc; (void)argv;
    int start = nhist > HIST ? nhist - HIST : 0;
    for (int i = start; i < nhist; i++) kprintf("%4d  %s\n", i + 1, hist[i % HIST]);
    return 0;
}

static int c_color(int argc, char **argv)
{
    if (argc < 2) { err("color", "usage: color <0-15>"); return 1; }
    console_color((uint8_t)(atol(argv[1]) & 15), COL_BLACK);
    return 0;
}

static int c_sleep(int argc, char **argv) { if (argc > 1) sleep_ms((uint64_t)atol(argv[1]) * 1000); return 0; }

static int c_hexdump(int argc, char **argv)
{
    if (argc < 2) { err("hexdump", "usage: hexdump <file>"); return 1; }
    fnode *f = need("hexdump", argv[1]);
    if (!f || f->is_dir || !fs_can_read(f, uid())) { if (f) err("hexdump", "cannot read"); return 1; }
    for (size_t o = 0; o < f->size; o += 16) {
        kprintf("%08lx  ", (uint64_t)o);
        for (size_t i = 0; i < 16; i++) {
            if (o + i < f->size) kprintf("%02x ", (uint8_t)f->data[o + i]); else kprintf("   ");
        }
        kprintf(" |");
        for (size_t i = 0; i < 16 && o + i < f->size; i++) {
            char c = f->data[o + i];
            console_putc(c >= 32 && c < 127 ? c : '.');
        }
        kprintf("|\n");
    }
    return 0;
}

static int c_reboot(int argc, char **argv)
{
    (void)argc; (void)argv;
    if (uid() != 0) { err("reboot", "must be root (try: sudo reboot)"); return 1; }
    kprintf("Rebooting...\n");
    reboot();
    return 0;
}

static int c_shutdown(int argc, char **argv)
{
    (void)argc; (void)argv;
    if (uid() != 0) { err("shutdown", "must be root (try: sudo shutdown)"); return 1; }
    kprintf("Powering off. Goodbye!\n");
    poweroff();
    return 0;
}

static int c_status(int argc, char **argv) { (void)argc; (void)argv; kprintf("%d\n", last_status); return 0; }

static const cmd_t cmds[] = {
    { "help",     c_help,     "show this list" },
    { "sysinfo",  c_sysinfo,  "system overview (logo, CPU, memory, uptime)" },
    { "ls",       c_ls,       "list files  [-l long] [-a all] [path]" },
    { "cd",       c_cd,       "change directory" },
    { "pwd",      c_pwd,      "print working directory" },
    { "tree",     c_tree,     "show a directory tree" },
    { "mkdir",    c_mkdir,    "create directories" },
    { "touch",    c_touch,    "create empty files" },
    { "write",    c_write,    "write a text file line by line" },
    { "cat",      c_cat,      "print files" },
    { "cp",       c_cp,       "copy a file" },
    { "mv",       c_mv,       "move or rename" },
    { "rm",       c_rm,       "remove files  [-r for folders]" },
    { "wc",       c_wc,       "count lines, words, bytes" },
    { "grep",     c_grep,     "search text in a file" },
    { "hexdump",  c_hexdump,  "show file bytes in hex" },
    { "chmod",    c_chmod,    "change permissions (octal)" },
    { "chown",    c_chown,    "change owner (root)" },
    { "whoami",   c_whoami,   "current user" },
    { "id",       c_id,       "user identity" },
    { "users",    c_users,    "list user accounts" },
    { "su",       c_su,       "switch user (default root)" },
    { "sudo",     c_sudo,     "run one command as root" },
    { "exit",     c_exit,     "leave a su session" },
    { "useradd",  c_useradd,  "add a user (root)" },
    { "passwd",   c_passwd,   "change a password" },
    { "echo",     c_echo,     "print text" },
    { "calc",     c_calc,     "integer calculator" },
    { "date",     c_date,     "date and time from the hardware clock" },
    { "uptime",   c_uptime,   "time since boot" },
    { "free",     c_free,     "memory usage" },
    { "uname",    c_uname,    "OS name  [-a]" },
    { "history",  c_history,  "command history" },
    { "status",   c_status,   "exit code of the last command" },
    { "color",    c_color,    "set text color 0-15" },
    { "sleep",    c_sleep,    "wait N seconds" },
    { "clear",    c_clear,    "clear the screen" },
    { "reboot",   c_reboot,   "restart the machine (root)" },
    { "shutdown", c_shutdown, "power off (root)" },
    { NULL, NULL, NULL },
};

/* ------------------------------------------------------------------ */
/* Parsing and execution                                               */

static int tokenize(char *s, char **argv)
{
    int argc = 0;
    while (*s && argc < MAXARGS - 1) {
        while (*s == ' ' || *s == '\t') s++;
        if (!*s) break;
        char q = 0, *out = s;
        argv[argc++] = s;
        while (*s && (q || (*s != ' ' && *s != '\t'))) {
            if (!q && (*s == '"' || *s == '\'')) q = *s++;
            else if (q && *s == q) { q = 0; s++; }
            else *out++ = *s++;
        }
        if (*s) s++;
        *out = 0;
    }
    argv[argc] = NULL;
    return argc;
}

static int run_one(char *line)
{
    /* Find an unquoted > or >> for redirection. */
    char *redir = NULL; int append = 0; char q = 0;
    for (char *p = line; *p; p++) {
        if (q) { if (*p == q) q = 0; continue; }
        if (*p == '"' || *p == '\'') { q = *p; continue; }
        if (*p == '>') { redir = p; append = p[1] == '>'; break; }
    }
    char *target = NULL;
    if (redir) {
        *redir = 0;
        target = redir + 1 + append;
        while (*target == ' ') target++;
        char *e = target + strlen(target);
        while (e > target && e[-1] == ' ') *--e = 0;
        if (!*target) { err("omsh", "missing file after >"); return 1; }
    }
    char *argv[MAXARGS];
    int argc = tokenize(line, argv);
    if (!argc) return 0;
    const cmd_t *c = NULL;
    for (const cmd_t *k = cmds; k->name; k++) if (!strcmp(k->name, argv[0])) { c = k; break; }
    if (!c) { char m[96]; ksnprintf(m, sizeof m, "command not found (type 'help')"); err(argv[0], m); return 127; }
    if (!target) return c->fn(argc, argv);

    fnode *f = fs_lookup(cwd, target);
    const char *e;
    if (f && (f->is_dir || !fs_can_write(f, uid()))) { err("omsh", "cannot write to that file"); return 1; }
    if (!f && !(f = fs_create(cwd, target, 0, uid(), 0644, &e))) { err("omsh", e); return 1; }
    char *buf = kmalloc(CAPTURE);
    if (!buf) { err("omsh", "out of memory"); return 1; }
    size_t len = 0;
    console_capture(buf, CAPTURE, &len);
    int rc = c->fn(argc, argv);
    console_capture(NULL, 0, NULL);
    fs_write(f, buf, len, append);
    kfree(buf);
    return rc;
}

static int run_line(char *line)
{
    int rc = 0; char q = 0; char *start = line;
    for (char *p = line;; p++) {
        if (q) { if (*p == q) q = 0; else if (!*p) break; continue; }
        if (*p == '"' || *p == '\'') { q = *p; continue; }
        if (*p == ';' || !*p) {
            int end = !*p;
            *p = 0;
            rc = run_one(start);
            if (end) break;
            start = p + 1;
        }
    }
    if (q) rc = run_one(start);
    return rc;
}

static void prompt(void)
{
    char p[512]; fs_path(cwd, p, sizeof p);
    const char *home = me()->home;
    size_t hl = strlen(home);
    char shown[512];
    if (!strncmp(p, home, hl) && (p[hl] == 0 || p[hl] == '/')) ksnprintf(shown, sizeof shown, "~%s", p + hl);
    else strncpy0(shown, p, sizeof shown);
    console_color(uid() == 0 ? COL_LRED : COL_LGREEN, COL_BLACK);
    kprintf("%s@omnios", me()->name);
    console_color(COL_GREY, COL_BLACK);
    kprintf(":");
    console_color(COL_LBLUE, COL_BLACK);
    kprintf("%s", shown);
    console_color(COL_GREY, COL_BLACK);
    kprintf("%c ", uid() == 0 ? '#' : '$');
}

void shell_run(void)
{
    ustack[0] = 1;   /* boot straight into the 'omni' user */
    cwd = fs_lookup(NULL, me()->home);
    fnode *motd = fs_lookup(NULL, "/etc/motd");
    if (motd) console_write(motd->data, motd->size);
    kprintf("Default accounts: omni/omni (sudo) and root/root.\n\n");
    char line[LINE], work[LINE];
    for (;;) {
        prompt();
        size_t n = readline(line, sizeof line, 0);
        if (n == (size_t)-1 || n == 0) continue;
        if (nhist == 0 || strcmp(hist[(nhist - 1) % HIST], line)) strcpy(hist[nhist++ % HIST], line);
        strcpy(work, line);
        last_status = run_line(work);
    }
}
