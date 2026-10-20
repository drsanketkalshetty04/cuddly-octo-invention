# OmniOS build. Needs: gcc, nasm, ld, grub-mkrescue, xorriso (and qemu to run).
CC      := gcc
CFLAGS  := -std=gnu11 -O2 -Wall -Wextra -ffreestanding -fno-stack-protector -fno-pic -fno-pie \
           -mno-red-zone -mgeneral-regs-only -mcmodel=small -m64 -nostdlib -fno-builtin
LDFLAGS := -n -T linker.ld -nostdlib -z max-page-size=0x1000 -z noexecstack --no-warn-rwx-segments -no-pie

SRC  := $(wildcard kernel/*.c)
OBJ  := $(patsubst kernel/%.c,build/%.o,$(SRC)) build/boot.o

all: omnios.iso

build/%.o: kernel/%.c kernel/omnios.h | build
	$(CC) $(CFLAGS) -c $< -o $@

build/boot.o: boot/boot.asm | build
	nasm -f elf64 $< -o $@

build:
	mkdir -p build

build/omnios.elf: $(OBJ) linker.ld
	ld $(LDFLAGS) -o $@ $(OBJ)

omnios.iso: build/omnios.elf iso/boot/grub/grub.cfg
	mkdir -p build/iso/boot/grub
	cp build/omnios.elf build/iso/boot/omnios.elf
	cp iso/boot/grub/grub.cfg build/iso/boot/grub/grub.cfg
	grub-mkrescue -o $@ build/iso 2>/dev/null

run: omnios.iso
	qemu-system-x86_64 -cdrom omnios.iso -m 256M -serial stdio

run-serial: omnios.iso
	qemu-system-x86_64 -cdrom omnios.iso -m 256M -nographic

test: omnios.iso
	python3 tests/boot_test.py

clean:
	rm -rf build omnios.iso

.PHONY: all run run-serial test clean
