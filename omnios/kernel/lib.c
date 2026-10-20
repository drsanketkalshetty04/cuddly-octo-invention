/* Freestanding C library pieces: strings, memory, formatted output. */
#include "omnios.h"

void *memset(void *d, int c, size_t n) { uint8_t *p = d; while (n--) *p++ = (uint8_t)c; return d; }
void *memcpy(void *d, const void *s, size_t n) { uint8_t *a = d; const uint8_t *b = s; while (n--) *a++ = *b++; return d; }
void *memmove(void *d, const void *s, size_t n)
{
    uint8_t *a = d; const uint8_t *b = s;
    if (a < b) while (n--) *a++ = *b++;
    else { a += n; b += n; while (n--) *--a = *--b; }
    return d;
}
int memcmp(const void *x, const void *y, size_t n)
{
    const uint8_t *a = x, *b = y;
    for (; n; n--, a++, b++) if (*a != *b) return *a - *b;
    return 0;
}
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }
int strcmp(const char *a, const char *b) { while (*a && *a == *b) a++, b++; return (uint8_t)*a - (uint8_t)*b; }
int strncmp(const char *a, const char *b, size_t n)
{
    for (; n; n--, a++, b++) { if (*a != *b || !*a) return (uint8_t)*a - (uint8_t)*b; }
    return 0;
}
char *strcpy(char *d, const char *s) { char *r = d; while ((*d++ = *s++)); return r; }
char *strncpy0(char *d, const char *s, size_t n)
{
    size_t i = 0;
    if (!n) return d;
    for (; i + 1 < n && s[i]; i++) d[i] = s[i];
    d[i] = 0;
    return d;
}
char *strchr(const char *s, int c) { for (; *s; s++) if (*s == (char)c) return (char *)s; return c ? NULL : (char *)s; }
char *strstr(const char *h, const char *n)
{
    size_t l = strlen(n);
    for (; *h; h++) if (!strncmp(h, n, l)) return (char *)h;
    return l ? NULL : (char *)h;
}
char *strdup(const char *s) { size_t n = strlen(s) + 1; char *d = kmalloc(n); if (d) memcpy(d, s, n); return d; }
long atol(const char *s)
{
    long v = 0; int neg = 0;
    while (*s == ' ') s++;
    if (*s == '-') neg = 1, s++; else if (*s == '+') s++;
    while (*s >= '0' && *s <= '9') v = v * 10 + (*s++ - '0');
    return neg ? -v : v;
}

/* Minimal printf: %s %c %d %i %u %x %X %p %% with l/ll, width, '-' and '0' flags. */
int kvsnprintf(char *buf, size_t n, const char *fmt, va_list ap)
{
    size_t o = 0;
#define PUT(ch) do { if (o + 1 < n) buf[o] = (ch); o++; } while (0)
    for (; *fmt; fmt++) {
        if (*fmt != '%') { PUT(*fmt); continue; }
        fmt++;
        int left = 0, zero = 0, width = 0, lng = 0;
        for (;; fmt++) { if (*fmt == '-') left = 1; else if (*fmt == '0') zero = 1; else break; }
        while (*fmt >= '0' && *fmt <= '9') width = width * 10 + (*fmt++ - '0');
        while (*fmt == 'l') lng++, fmt++;
        char tmp[32]; const char *s = tmp; int len = 0;
        switch (*fmt) {
        case 's': s = va_arg(ap, const char *); if (!s) s = "(null)"; len = (int)strlen(s); break;
        case 'c': tmp[0] = (char)va_arg(ap, int); len = 1; break;
        case '%': tmp[0] = '%'; len = 1; break;
        case 'd': case 'i': case 'u': case 'x': case 'X': case 'p': {
            uint64_t v; int neg = 0, base = 10;
            if (*fmt == 'p') { v = (uint64_t)va_arg(ap, void *); base = 16; }
            else if (*fmt == 'd' || *fmt == 'i') {
                int64_t sv = lng ? va_arg(ap, int64_t) : va_arg(ap, int);
                if (sv < 0) { neg = 1; v = (uint64_t)(-sv); } else v = (uint64_t)sv;
            } else {
                v = lng ? va_arg(ap, uint64_t) : va_arg(ap, unsigned);
                if (*fmt != 'u') base = 16;
            }
            const char *dig = *fmt == 'X' ? "0123456789ABCDEF" : "0123456789abcdef";
            char rev[24]; int r = 0;
            do { rev[r++] = dig[v % base]; v /= base; } while (v);
            if (neg) tmp[len++] = '-';
            while (r) tmp[len++] = rev[--r];
            break;
        }
        default: tmp[0] = '%'; tmp[1] = *fmt; len = 2; if (!*fmt) fmt--; break;
        }
        int pad = width > len ? width - len : 0;
        if (!left) while (pad-- > 0) PUT(zero ? '0' : ' ');
        for (int i = 0; i < len; i++) PUT(s[i]);
        if (left) while (pad-- > 0) PUT(' ');
    }
    if (n) buf[o < n ? o : n - 1] = 0;
    return (int)o;
#undef PUT
}

int ksnprintf(char *buf, size_t n, const char *fmt, ...)
{
    va_list ap; va_start(ap, fmt);
    int r = kvsnprintf(buf, n, fmt, ap);
    va_end(ap);
    return r;
}

void kprintf(const char *fmt, ...)
{
    char buf[1024];
    va_list ap; va_start(ap, fmt);
    int r = kvsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    console_write(buf, r < (int)sizeof buf ? (size_t)r : sizeof buf - 1);
}
