#!/usr/bin/env python3
"""Boot OmniOS in QEMU, drive the shell over the serial port, check the results."""
import os
import re
import select
import subprocess
import sys
import time

ISO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "omnios.iso")
ANSI = re.compile(rb"\x1b\[[0-9;]*[A-Za-z]")


class VM:
    def __init__(self):
        self.p = subprocess.Popen(
            ["qemu-system-x86_64", "-cdrom", ISO, "-m", "256M", "-nographic", "-no-reboot"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        self.buf = b""

    def expect(self, pattern, timeout=30):
        end = time.time() + timeout
        while time.time() < end:
            text = ANSI.sub(b"", self.buf).decode(errors="replace")
            m = re.search(pattern, text)
            if m:
                self.buf = b""
                return text
            r, _, _ = select.select([self.p.stdout], [], [], 0.2)
            if r:
                chunk = os.read(self.p.stdout.fileno(), 65536)
                if not chunk:
                    break
                self.buf += chunk
        raise AssertionError(f"timed out waiting for {pattern!r}; got:\n"
                             + ANSI.sub(b"", self.buf).decode(errors="replace")[-2000:])

    def send(self, line):
        for ch in line + "\r":   # type slowly: the UART FIFO is only 16 bytes
            self.p.stdin.write(ch.encode())
            self.p.stdin.flush()
            time.sleep(0.004)

    def run(self, line, prompt=r"[$#] $"):
        self.send(line)
        return self.expect(prompt)


def main():
    vm = VM()
    passed = 0

    def check(name, cond, out=""):
        nonlocal passed
        if not cond:
            print(f"FAIL: {name}\n{out}")
            vm.p.kill()
            sys.exit(1)
        print(f"ok   {name}")
        passed += 1

    out = vm.expect(r"omni@omnios:~\$ $", timeout=60)
    check("boots to shell prompt", "OmniFS mounted" in out and "Welcome to OmniOS" in out, out)

    out = vm.run("whoami")
    check("starts as normal user", "omni" in out, out)
    out = vm.run("sysinfo")
    check("sysinfo", "OmniOS 0.1.0" in out and "Memory:" in out, out)
    out = vm.run("echo hello world > greet.txt; cat greet.txt")
    check("redirection + chaining", "hello world" in out, out)
    out = vm.run("echo second line >> greet.txt; wc greet.txt")
    check("append", "2 lines" in out, out)
    out = vm.run("mkdir projects; mv greet.txt projects; ls projects")
    check("mkdir/mv/ls", "greet.txt" in out, out)
    out = vm.run("cat /root/secret.txt")
    check("non-root blocked from /root", "permission denied" in out, out)
    out = vm.run("calc (2+3)*7 - 10/2")
    check("calc", "30" in out, out)
    out = vm.run("shutdown")
    check("shutdown needs root", "must be root" in out, out)

    vm.send("su")
    vm.expect(r"Password for root: $")
    out = vm.run("root", prompt=r"# $")
    check("su to root", "You are now root" in out, out)
    out = vm.run("cat /root/secret.txt", prompt=r"# $")
    check("root reads protected file", "Only root can read" in out, out)
    out = vm.run("useradd alice pw123", prompt=r"# $")
    check("useradd", "created user alice" in out, out)
    out = vm.run("ls -l /home", prompt=r"# $")
    check("ls -l shows owners", "alice" in out and "omni" in out, out)
    out = vm.run("exit")
    check("exit back to omni", "logout" in out, out)

    vm.send("sudo shutdown")
    vm.expect(r"Password for omni: $")
    vm.send("omni")
    vm.expect(r"Goodbye")
    try:
        vm.p.wait(timeout=15)
        check("sudo shutdown powers off the VM", True)
    except subprocess.TimeoutExpired:
        check("sudo shutdown powers off the VM", False)
    print(f"\nAll {passed} checks passed.")


if __name__ == "__main__":
    main()
