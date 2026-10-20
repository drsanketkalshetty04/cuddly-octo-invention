/* Console: VGA text mode (80x25) mirrored to the COM1 serial port. */
#include "saksham.h"

#define VGA ((volatile uint16_t *)0xB8000)
#define W 80
#define H 25
#define COM1 0x3F8

static int cx, cy;
static uint8_t attr = (COL_BLACK << 4) | COL_GREY;
static char *cap_buf;
static size_t cap_cap, *cap_len;

static void cursor_sync(void)
{
    uint16_t pos = (uint16_t)(cy * W + cx);
    outb(0x3D4, 0x0F); outb(0x3D5, pos & 0xFF);
    outb(0x3D4, 0x0E); outb(0x3D5, pos >> 8);
}

static void serial_putc(char c)
{
    for (int i = 0; i < 100000 && !(inb(COM1 + 5) & 0x20); i++) ;
    outb(COM1, (uint8_t)c);
}

static void serial_puts(const char *s) { while (*s) serial_putc(*s++); }

int serial_getc(void)
{
    if (!(inb(COM1 + 5) & 1)) return -1;
    return inb(COM1);
}

void console_init(void)
{
    outb(COM1 + 1, 0x00);   /* no interrupts: polled */
    outb(COM1 + 3, 0x80);   /* DLAB */
    outb(COM1 + 0, 0x01);   /* 115200 baud */
    outb(COM1 + 1, 0x00);
    outb(COM1 + 3, 0x03);   /* 8N1 */
    outb(COM1 + 2, 0xC7);   /* FIFO */
    outb(COM1 + 4, 0x0B);
    console_clear();
}

static void scroll(void)
{
    for (int i = 0; i < (H - 1) * W; i++) VGA[i] = VGA[i + W];
    for (int i = (H - 1) * W; i < H * W; i++) VGA[i] = (uint16_t)(attr << 8 | ' ');
    cy = H - 1;
}

void console_putc(char c)
{
    if (cap_buf) {
        if (*cap_len + 1 < cap_cap) cap_buf[(*cap_len)++] = c;
        return;
    }
    if (c == '\n') serial_putc('\r');
    serial_putc(c);
    switch (c) {
    case '\n': cx = 0; cy++; break;
    case '\r': cx = 0; break;
    case '\b': if (cx > 0) cx--; else if (cy > 0) cx = W - 1, cy--; break;
    case '\t': do console_putc(' '); while (cx % 4); return;
    default:
        VGA[cy * W + cx] = (uint16_t)(attr << 8 | (uint8_t)c);
        if (++cx >= W) cx = 0, cy++;
    }
    if (cy >= H) scroll();
    cursor_sync();
}

void console_write(const char *s, size_t n) { while (n--) console_putc(*s++); }

void console_clear(void)
{
    for (int i = 0; i < W * H; i++) VGA[i] = (uint16_t)(attr << 8 | ' ');
    cx = cy = 0;
    cursor_sync();
    if (!cap_buf) serial_puts("\x1b[2J\x1b[H");
}

void console_color(uint8_t fg, uint8_t bg)
{
    /* VGA color index -> ANSI color index */
    static const char ansi[8] = { 0, 4, 2, 6, 1, 5, 3, 7 };
    attr = (uint8_t)((bg & 0xF) << 4 | (fg & 0xF));
    if (cap_buf) return;
    char seq[24];
    ksnprintf(seq, sizeof seq, "\x1b[0;%s3%c;4%cm", (fg & 8) ? "1;" : "",
              '0' + ansi[fg & 7], '0' + ansi[bg & 7]);
    serial_puts(seq);
}

void console_capture(char *buf, size_t cap, size_t *len)
{
    cap_buf = buf; cap_cap = cap; cap_len = len;
}
