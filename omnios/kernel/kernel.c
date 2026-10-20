/* OmniOS kernel entry point. */
#include "omnios.h"

static void ok(const char *what)
{
    console_color(COL_LGREEN, COL_BLACK);
    kprintf("  [ OK ] ");
    console_color(COL_GREY, COL_BLACK);
    kprintf("%s\n", what);
}

void kmain(uint64_t mb_magic, uint64_t mb_info)
{
    console_init();
    console_color(COL_LCYAN, COL_BLACK);
    kprintf("%s %s - booting (x86_64 long mode)\n", OMNIOS_NAME, OMNIOS_VERSION);
    console_color(COL_GREY, COL_BLACK);

    mem_init(mb_magic, mb_info);
    char msg[96];
    ksnprintf(msg, sizeof msg, "Memory: %lu MiB RAM, %lu MiB kernel heap", mem_total() >> 20, heap_size() >> 20);
    ok(msg);
    arch_init();
    ok("Interrupts, 100 Hz timer, PS/2 keyboard, serial console");
    fs_init();
    ok("OmniFS mounted at /");
    kprintf("\n");
    shell_run();
}
