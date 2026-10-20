/* Memory: Multiboot2 memory map parsing and a first-fit kernel heap. */
#include "saksham.h"

extern char kernel_end[];

typedef struct block {
    size_t size;            /* payload bytes */
    int free;
    struct block *next;
} block;

static block *heap;
static uint64_t heap_bytes, used_bytes, total_ram;
static char loader[64] = "unknown";

#define ALIGN_UP(x, a) (((x) + (a) - 1) & ~((uint64_t)(a) - 1))
#define HDR sizeof(block)

void mem_init(uint64_t magic, uint64_t mbi)
{
    uint64_t start = ALIGN_UP((uint64_t)kernel_end, 4096), end = 0;
    if (magic == 0x36d76289 && mbi) {
        uint32_t mbi_size = *(uint32_t *)mbi;
        if (mbi + mbi_size > start) start = ALIGN_UP(mbi + mbi_size, 4096);
        for (uint8_t *t = (uint8_t *)(mbi + 8); ; t += ALIGN_UP(*(uint32_t *)(t + 4), 8)) {
            uint32_t type = *(uint32_t *)t, size = *(uint32_t *)(t + 4);
            if (type == 0) break;
            if (type == 2) strncpy0(loader, (char *)(t + 8), sizeof loader);
            if (type == 6) {
                uint32_t esz = *(uint32_t *)(t + 8);
                for (uint8_t *e = t + 16; e < t + size; e += esz) {
                    uint64_t base = *(uint64_t *)e, len = *(uint64_t *)(e + 8);
                    uint32_t et = *(uint32_t *)(e + 16);
                    if (et != 1) continue;
                    total_ram += len;
                    if (start >= base && start < base + len) end = base + len;
                }
            }
        }
    }
    if (!end) end = start + 16 * 1024 * 1024;           /* conservative fallback */
    if (end > 0xFFFFFFFFull) end = 0xFFFFFFFFull;      /* stay inside our 4 GiB identity map */
    if (!total_ram) total_ram = end;
    heap_bytes = end - start;
    heap = (block *)start;
    heap->size = heap_bytes - HDR;
    heap->free = 1;
    heap->next = NULL;
}

void *kmalloc(size_t n)
{
    n = ALIGN_UP(n ? n : 1, 16);
    for (block *b = heap; b; b = b->next) {
        if (!b->free || b->size < n) continue;
        if (b->size >= n + HDR + 32) {          /* split */
            block *rest = (block *)((char *)(b + 1) + n);
            rest->size = b->size - n - HDR;
            rest->free = 1;
            rest->next = b->next;
            b->next = rest;
            b->size = n;
        }
        b->free = 0;
        used_bytes += b->size + HDR;
        return b + 1;
    }
    return NULL;
}

void *kzalloc(size_t n) { void *p = kmalloc(n); if (p) memset(p, 0, n); return p; }

void kfree(void *p)
{
    if (!p) return;
    block *b = (block *)p - 1;
    b->free = 1;
    used_bytes -= b->size + HDR;
    for (block *c = heap; c; c = c->next)        /* coalesce neighbours */
        while (c->free && c->next && c->next->free &&
               (char *)(c + 1) + c->size == (char *)c->next) {
            c->size += HDR + c->next->size;
            c->next = c->next->next;
        }
}

void *krealloc(void *p, size_t n)
{
    if (!p) return kmalloc(n);
    block *b = (block *)p - 1;
    if (b->size >= n) return p;
    void *q = kmalloc(n);
    if (!q) return NULL;
    memcpy(q, p, b->size);
    kfree(p);
    return q;
}

uint64_t mem_total(void) { return total_ram; }
uint64_t heap_used(void) { return used_bytes; }
uint64_t heap_size(void) { return heap_bytes; }
const char *boot_loader_name(void) { return loader; }
