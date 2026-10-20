/* x86-64 platform: IDT, exceptions, PIC, PIT timer, PS/2 keyboard, RTC, power. */
#include "omnios.h"

typedef struct {
    uint64_t r15, r14, r13, r12, r11, r10, r9, r8, rbp, rdi, rsi, rdx, rcx, rbx, rax;
    uint64_t vec, err, rip, cs, rflags, rsp, ss;
} regs_t;

struct idt_entry {
    uint16_t off_lo, sel;
    uint8_t ist, flags;
    uint16_t off_mid;
    uint32_t off_hi, zero;
} __attribute__((packed));

static struct idt_entry idt[48];
extern uint64_t isr_table[48];
static volatile uint64_t tick_count;

/* ---- keyboard ring buffer ---- */
static volatile uint8_t kbuf[256];
static volatile uint8_t khead, ktail;
static int shift, ctrl, caps, e0;

static const char km_lo[128] =
    "\0\x1b" "1234567890-=\b\tqwertyuiop[]\n\0asdfghjkl;'`\0\\zxcvbnm,./\0*\0 ";
static const char km_hi[128] =
    "\0\x1b" "!@#$%^&*()_+\b\tQWERTYUIOP{}\n\0ASDFGHJKL:\"~\0|ZXCVBNM<>?\0*\0 ";

static void kpush(uint8_t c) { uint8_t n = (uint8_t)(khead + 1); if (n != ktail) { kbuf[khead] = c; khead = n; } }

static void keyboard_irq(void)
{
    uint8_t sc = inb(0x60);
    if (sc == 0xE0) { e0 = 1; return; }
    int up = sc & 0x80; sc &= 0x7F;
    if (e0) {
        e0 = 0;
        if (up) return;
        if (sc == 0x48) kpush(KEY_UP);
        else if (sc == 0x50) kpush(KEY_DOWN);
        else if (sc == 0x4B) kpush(KEY_LEFT);
        else if (sc == 0x4D) kpush(KEY_RIGHT);
        else if (sc == 0x1C) kpush('\n');
        return;
    }
    if (sc == 0x2A || sc == 0x36) { shift = !up; return; }
    if (sc == 0x1D) { ctrl = !up; return; }
    if (sc == 0x3A && !up) { caps = !caps; return; }
    if (up) return;
    char c = (shift ? km_hi : km_lo)[sc];
    if (!c) return;
    if (caps && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))) c ^= 0x20;
    if (ctrl && (c | 0x20) >= 'a' && (c | 0x20) <= 'z') c = (char)((c | 0x20) - 'a' + 1);
    kpush((uint8_t)c);
}

static const char *exc_names[] = {
    "Divide by zero", "Debug", "NMI", "Breakpoint", "Overflow", "Bound range",
    "Invalid opcode", "Device not available", "Double fault", "Coprocessor overrun",
    "Invalid TSS", "Segment not present", "Stack fault", "General protection fault",
    "Page fault", "Reserved", "x87 FP error", "Alignment check", "Machine check", "SIMD FP error",
};

void isr_handler(regs_t *r)
{
    if (r->vec < 32) {
        uint64_t cr2; __asm__ volatile("mov %%cr2,%0" : "=r"(cr2));
        console_color(COL_WHITE, COL_RED);
        kprintf("\n*** KERNEL PANIC: %s (vector %u, error %lx) ***\n",
                r->vec < 20 ? exc_names[r->vec] : "Reserved", (unsigned)r->vec, r->err);
        kprintf("RIP=%lx RSP=%lx CR2=%lx\nSystem halted.\n", r->rip, r->rsp, cr2);
        for (;;) { __asm__ volatile("cli"); cpu_halt(); }
    }
    if (r->vec == 32) tick_count++;
    else if (r->vec == 33) keyboard_irq();
    if (r->vec >= 40) outb(0xA0, 0x20);
    outb(0x20, 0x20);
}

static void pic_remap(void)
{
    outb(0x20, 0x11); io_wait(); outb(0xA0, 0x11); io_wait();
    outb(0x21, 0x20); io_wait(); outb(0xA1, 0x28); io_wait();
    outb(0x21, 0x04); io_wait(); outb(0xA1, 0x02); io_wait();
    outb(0x21, 0x01); io_wait(); outb(0xA1, 0x01); io_wait();
    outb(0x21, 0xFC);   /* unmask timer + keyboard */
    outb(0xA1, 0xFF);
}

void arch_init(void)
{
    for (int i = 0; i < 48; i++) {
        uint64_t a = isr_table[i];
        idt[i] = (struct idt_entry){ (uint16_t)a, 0x08, 0, 0x8E, (uint16_t)(a >> 16), (uint32_t)(a >> 32), 0 };
    }
    struct { uint16_t lim; uint64_t base; } __attribute__((packed)) idtr = { sizeof idt - 1, (uint64_t)idt };
    __asm__ volatile("lidt %0" :: "m"(idtr));
    pic_remap();
    uint16_t div = 1193182 / 100;  /* PIT at 100 Hz */
    outb(0x43, 0x36); outb(0x40, div & 0xFF); outb(0x40, div >> 8);
    while (inb(0x64) & 1) inb(0x60);   /* flush stale keyboard bytes */
    __asm__ volatile("sti");
}

uint64_t ticks(void) { return tick_count; }

void sleep_ms(uint64_t ms)
{
    uint64_t end = tick_count + (ms + 9) / 10;
    while (tick_count < end) cpu_halt();
}

/* Serial escape sequences (ESC [ A..D) arrive one byte at a time. */
static int serial_key(void)
{
    static int st;
    int c = serial_getc();
    if (c < 0) return -1;
    if (st == 0 && c == 0x1b) { st = 1; return -1; }
    if (st == 1) { st = c == '[' ? 2 : 0; return -1; }
    if (st == 2) {
        st = 0;
        switch (c) { case 'A': return KEY_UP; case 'B': return KEY_DOWN;
                     case 'C': return KEY_RIGHT; case 'D': return KEY_LEFT; }
        return -1;
    }
    if (c == '\r') return '\n';
    if (c == 0x7f) return '\b';
    return c;
}

int getchar_block(void)
{
    for (;;) {
        if (khead != ktail) { uint8_t c = kbuf[ktail]; ktail = (uint8_t)(ktail + 1); return c; }
        int c = serial_key();
        if (c >= 0) return c;
        cpu_halt();
    }
}

void reboot(void)
{
    __asm__ volatile("cli");
    while (inb(0x64) & 2) ;
    outb(0x64, 0xFE);
    for (;;) cpu_halt();
}

void poweroff(void)
{
    outw(0x604, 0x2000);    /* QEMU */
    outw(0xB004, 0x2000);   /* Bochs / older QEMU */
    outw(0x4004, 0x3400);   /* VirtualBox */
    __asm__ volatile("cli");
    for (;;) cpu_halt();
}

static uint8_t cmos(uint8_t reg) { outb(0x70, reg); return inb(0x71); }

void rtc_read(rtc_time *t)
{
    while (cmos(0x0A) & 0x80) ;
    int s = cmos(0), m = cmos(2), h = cmos(4), d = cmos(7), mo = cmos(8), y = cmos(9);
    if (!(cmos(0x0B) & 4)) {   /* BCD -> binary */
#define BCD(x) (((x) & 0x0F) + ((x) >> 4) * 10)
        s = BCD(s); m = BCD(m); h = BCD(h & 0x7F) | (h & 0x80); d = BCD(d); mo = BCD(mo); y = BCD(y);
#undef BCD
    }
    t->sec = s; t->min = m; t->hour = h & 0x7F; t->day = d; t->mon = mo; t->year = 2000 + y;
}

void cpu_brand(char *out)
{
    uint32_t r[12];
    uint32_t max;
    __asm__ volatile("cpuid" : "=a"(max) : "a"(0x80000000) : "ebx", "ecx", "edx");
    if (max < 0x80000004) { strcpy(out, "Unknown x86-64 CPU"); return; }
    for (int i = 0; i < 3; i++)
        __asm__ volatile("cpuid" : "=a"(r[i*4]), "=b"(r[i*4+1]), "=c"(r[i*4+2]), "=d"(r[i*4+3])
                         : "a"(0x80000002 + i));
    memcpy(out, r, 48);
    out[48] = 0;
    char *p = out; while (*p == ' ') p++;
    memmove(out, p, strlen(p) + 1);
}
