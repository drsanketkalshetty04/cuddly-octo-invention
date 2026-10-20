/* Saksham OS kernel - shared declarations. */
#ifndef SAKSHAM_H
#define SAKSHAM_H

#include <stdint.h>
#include <stddef.h>
#include <stdarg.h>

#define SAKSHAM_NAME    "Saksham OS"
#define SAKSHAM_VERSION "0.1.0"

/* ---- port I/O ---- */
static inline void outb(uint16_t p, uint8_t v) { __asm__ volatile("outb %0,%1" :: "a"(v), "Nd"(p)); }
static inline void outw(uint16_t p, uint16_t v) { __asm__ volatile("outw %0,%1" :: "a"(v), "Nd"(p)); }
static inline uint8_t inb(uint16_t p) { uint8_t v; __asm__ volatile("inb %1,%0" : "=a"(v) : "Nd"(p)); return v; }
static inline void io_wait(void) { outb(0x80, 0); }
static inline void cpu_halt(void) { __asm__ volatile("hlt"); }

/* ---- lib.c ---- */
void *memset(void *d, int c, size_t n);
void *memcpy(void *d, const void *s, size_t n);
void *memmove(void *d, const void *s, size_t n);
int memcmp(const void *a, const void *b, size_t n);
size_t strlen(const char *s);
int strcmp(const char *a, const char *b);
int strncmp(const char *a, const char *b, size_t n);
char *strcpy(char *d, const char *s);
char *strncpy0(char *d, const char *s, size_t n);   /* always NUL-terminates */
char *strchr(const char *s, int c);
char *strstr(const char *h, const char *n);
char *strdup(const char *s);
long atol(const char *s);
int kvsnprintf(char *buf, size_t n, const char *fmt, va_list ap);
int ksnprintf(char *buf, size_t n, const char *fmt, ...);
void kprintf(const char *fmt, ...);

/* ---- console.c ---- */
enum { COL_BLACK, COL_BLUE, COL_GREEN, COL_CYAN, COL_RED, COL_MAGENTA, COL_BROWN, COL_GREY,
       COL_DGREY, COL_LBLUE, COL_LGREEN, COL_LCYAN, COL_LRED, COL_PINK, COL_YELLOW, COL_WHITE };
void console_init(void);
void console_putc(char c);
void console_write(const char *s, size_t n);
void console_clear(void);
void console_color(uint8_t fg, uint8_t bg);
void console_capture(char *buf, size_t cap, size_t *len);  /* buf=NULL stops capture */
int  serial_getc(void);   /* -1 if nothing */

/* ---- arch.c ---- */
#define KEY_UP    0x80
#define KEY_DOWN  0x81
#define KEY_LEFT  0x82
#define KEY_RIGHT 0x83
void arch_init(void);
uint64_t ticks(void);          /* 100 Hz */
int  getchar_block(void);
void sleep_ms(uint64_t ms);
void reboot(void);
void poweroff(void);
typedef struct { int sec, min, hour, day, mon, year; } rtc_time;
void rtc_read(rtc_time *t);
void cpu_brand(char *out);     /* 49 bytes */

/* ---- mem.c ---- */
void mem_init(uint64_t mb_magic, uint64_t mb_info);
void *kmalloc(size_t n);
void *kzalloc(size_t n);
void *krealloc(void *p, size_t n);
void kfree(void *p);
uint64_t mem_total(void);
uint64_t heap_used(void);
uint64_t heap_size(void);
const char *boot_loader_name(void);

/* ---- fs.c ---- */
#define P_UR 0400
#define P_UW 0200
#define P_UX 0100
#define P_OR 0004
#define P_OW 0002
#define P_OX 0001
typedef struct fnode {
    char name[64];
    int is_dir;
    uint32_t uid;
    uint16_t mode;
    char *data;
    size_t size, cap;
    uint64_t mtime;
    struct fnode *parent, *child, *next;
} fnode;
void   fs_init(void);
fnode *fs_root(void);
fnode *fs_lookup(fnode *cwd, const char *path);
fnode *fs_create(fnode *cwd, const char *path, int is_dir, uint32_t uid, uint16_t mode, const char **err);
int    fs_write(fnode *f, const char *buf, size_t n, int append);
int    fs_remove(fnode *f);
int    fs_move(fnode *f, fnode *cwd, const char *dest, const char **err);
void   fs_path(fnode *n, char *out, size_t cap);
int    fs_can_read(fnode *n, uint32_t uid);
int    fs_can_write(fnode *n, uint32_t uid);
int    fs_can_enter(fnode *n, uint32_t uid);
size_t fs_count(fnode *n, size_t *bytes);

/* ---- shell.c ---- */
void shell_run(void);

#endif
