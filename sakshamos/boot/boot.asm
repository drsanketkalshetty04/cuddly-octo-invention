; Saksham OS boot code: Multiboot2 header, 32-bit -> 64-bit long mode switch,
; identity-mapped paging for the first 4 GiB, and interrupt entry stubs.

section .multiboot_header
align 8
mb_start:
    dd 0xe85250d6                               ; multiboot2 magic
    dd 0                                        ; i386 protected mode
    dd mb_end - mb_start
    dd -(0xe85250d6 + 0 + (mb_end - mb_start))
    dw 0, 0                                     ; end tag
    dd 8
mb_end:

section .bss
align 4096
pml4:   resb 4096
pdpt:   resb 4096
pd:     resb 4096 * 4                           ; 4 x 512 x 2 MiB = 4 GiB
stack_bottom:
        resb 65536
stack_top:

section .rodata
align 8
gdt64:
    dq 0
.code: equ $ - gdt64
    dq (1 << 43) | (1 << 44) | (1 << 47) | (1 << 53)   ; exec, code, present, 64-bit
.data: equ $ - gdt64
    dq (1 << 41) | (1 << 44) | (1 << 47)               ; writable, data, present
.ptr:
    dw $ - gdt64 - 1
    dq gdt64

section .text
bits 32
global _start
extern kmain

_start:
    cli
    mov esp, stack_top
    mov edi, eax                ; multiboot2 magic
    mov esi, ebx                ; multiboot2 info pointer

    ; PML4[0] -> PDPT, PDPT[0..3] -> 4 page directories
    mov eax, pdpt
    or eax, 3
    mov [pml4], eax
    mov ecx, 0
.pdpt_loop:
    mov eax, ecx
    shl eax, 12
    add eax, pd
    or eax, 3
    mov [pdpt + ecx * 8], eax
    inc ecx
    cmp ecx, 4
    jne .pdpt_loop

    ; 2048 huge (2 MiB) pages identity-mapping 0..4 GiB
    mov ecx, 0
.pd_loop:
    mov eax, ecx
    shl eax, 21
    or eax, 0x83                ; present | writable | huge
    mov [pd + ecx * 8], eax
    mov dword [pd + ecx * 8 + 4], 0
    inc ecx
    cmp ecx, 2048
    jne .pd_loop

    mov eax, pml4
    mov cr3, eax
    mov eax, cr4
    or eax, 1 << 5              ; PAE
    mov cr4, eax
    mov ecx, 0xC0000080         ; EFER
    rdmsr
    or eax, 1 << 8              ; long mode enable
    wrmsr
    mov eax, cr0
    or eax, (1 << 31) | 1       ; paging | protected mode
    mov cr0, eax

    lgdt [gdt64.ptr]
    jmp gdt64.code:long_mode

bits 64
long_mode:
    mov ax, gdt64.data
    mov ds, ax
    mov es, ax
    mov ss, ax
    xor ax, ax
    mov fs, ax
    mov gs, ax
    mov edi, edi                ; zero-extend boot arguments
    mov esi, esi
    mov rsp, stack_top
    call kmain
.hang:
    cli
    hlt
    jmp .hang

; ---------------------------------------------------------------------
; Interrupt stubs: each pushes (error code, vector) then jumps to common.
extern isr_handler

%macro ISR_NOERR 1
global isr%1
isr%1:
    push 0
    push %1
    jmp isr_common
%endmacro

%macro ISR_ERR 1
global isr%1
isr%1:
    push %1
    jmp isr_common
%endmacro

%assign i 0
%rep 48
  %if i = 8 || (i >= 10 && i <= 14) || i = 17 || i = 21
    ISR_ERR i
  %else
    ISR_NOERR i
  %endif
  %assign i i+1
%endrep

isr_common:
    push rax
    push rbx
    push rcx
    push rdx
    push rsi
    push rdi
    push rbp
    push r8
    push r9
    push r10
    push r11
    push r12
    push r13
    push r14
    push r15
    mov rdi, rsp
    mov rbp, rsp
    and rsp, -16
    call isr_handler
    mov rsp, rbp
    pop r15
    pop r14
    pop r13
    pop r12
    pop r11
    pop r10
    pop r9
    pop r8
    pop rbp
    pop rdi
    pop rsi
    pop rdx
    pop rcx
    pop rbx
    pop rax
    add rsp, 16
    iretq

section .rodata
global isr_table
isr_table:
%assign i 0
%rep 48
    dq isr %+ i
  %assign i i+1
%endrep

section .note.GNU-stack noalloc noexec nowrite progbits
