#!/usr/bin/env python3
"""OmniBridge - one hub that links every device on your network.

Run it on any computer (Windows, macOS, Linux) or on Android (Termux) /
iPhone (a-Shell, Pyto). Every other device - phone, tablet, laptop - just
opens the printed URL in a browser. No app install, no cloud, no account.

Features
  * File manager: browse, upload (any size, streamed), download, zip folders,
    rename, delete, create folders
  * Shared clipboard: send text/links between all devices instantly
  * Device list: see every device currently connected
  * Auto-discovery: OmniBridge hubs on the same network find each other
  * Web terminal (opt-in with --terminal): run shell commands remotely

Pure Python standard library, Python 3.8+.
"""

import argparse
import json
import mimetypes
import os
import platform
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import zipfile
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.0.0"
DISCOVERY_PORT = 47474
CHUNK = 1024 * 1024
WEB_DIR = Path(__file__).resolve().parent / "web"


class Hub:
    """Shared state for one running hub."""

    def __init__(self, root, name, token, terminal):
        self.root = Path(root).resolve()
        self.name = name
        self.token = token
        self.terminal = terminal
        self.lock = threading.Lock()
        self.clips = []  # newest last
        self.devices = {}  # key -> info
        self.peers = {}  # url -> info
        self.url = ""

    def safe_path(self, rel):
        """Resolve a client path inside root; refuse anything that escapes it."""
        rel = (rel or "").replace("\\", "/").lstrip("/")
        p = (self.root / rel).resolve()
        if p != self.root and self.root not in p.parents:
            raise PermissionError("path outside shared folder")
        return p

    def rel(self, p):
        return p.relative_to(self.root).as_posix() if p != self.root else ""

    def add_clip(self, text, device):
        with self.lock:
            self.clips.append({"id": secrets.token_hex(4), "text": text[:100000],
                               "from": device, "time": time.time()})
            self.clips = self.clips[-50:]

    def touch_device(self, ip, agent, name):
        key = f"{ip}|{agent}"
        with self.lock:
            self.devices[key] = {"ip": ip, "name": name or describe_agent(agent),
                                 "seen": time.time()}

    def live_devices(self):
        now = time.time()
        with self.lock:
            return [d for d in self.devices.values() if now - d["seen"] < 30]

    def live_peers(self):
        now = time.time()
        with self.lock:
            return [p for p in self.peers.values() if now - p["seen"] < 20]


def describe_agent(agent):
    a = agent.lower()
    for key, label in (("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"),
                       ("windows", "Windows PC"), ("macintosh", "Mac"),
                       ("cros", "Chromebook"), ("linux", "Linux PC")):
        if key in a:
            return label
    return "Device"


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def entry_info(hub, p):
    st = p.stat()
    return {"name": p.name, "path": hub.rel(p), "dir": p.is_dir(),
            "size": st.st_size, "mtime": st.st_mtime}


class Handler(BaseHTTPRequestHandler):
    server_version = f"OmniBridge/{VERSION}"
    hub: Hub = None

    def log_message(self, fmt, *args):
        if self.server.verbose:
            sys.stderr.write("[%s] %s\n" % (self.client_address[0], fmt % args))

    # ---------- helpers ----------
    def query(self):
        return {k: v[0] for k, v in urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query).items()}

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def error(self, code, msg):
        self.send_json({"error": msg}, code)

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 5 * 1024 * 1024:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    def authed(self):
        tok = self.headers.get("X-Token") or self.query().get("t")
        if not tok:
            c = cookies.SimpleCookie(self.headers.get("Cookie", ""))
            tok = c["omni"].value if "omni" in c else None
        return tok is not None and secrets.compare_digest(tok, self.hub.token)

    # ---------- routing ----------
    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def route(self, method):
        path = urllib.parse.urlparse(self.path).path
        q = self.query()
        if method == "GET" and path in ("/", "/index.html"):
            return self.serve_index(q)
        if method == "GET" and path == "/api/ping":
            return self.send_json({"name": self.hub.name, "version": VERSION})
        if not self.authed():
            return self.error(401, "missing or wrong access token - open the full link printed by the hub")
        self.hub.touch_device(self.client_address[0], self.headers.get("User-Agent", ""),
                              self.headers.get("X-Device-Name"))
        routes = {
            ("GET", "/api/info"): self.api_info,
            ("GET", "/api/list"): self.api_list,
            ("GET", "/api/download"): self.api_download,
            ("GET", "/api/zip"): self.api_zip,
            ("PUT", "/api/upload"): self.api_upload,
            ("POST", "/api/mkdir"): self.api_mkdir,
            ("POST", "/api/rename"): self.api_rename,
            ("POST", "/api/delete"): self.api_delete,
            ("GET", "/api/clips"): self.api_clips,
            ("POST", "/api/clips"): self.api_add_clip,
            ("POST", "/api/exec"): self.api_exec,
        }
        fn = routes.get((method, path))
        if not fn:
            return self.error(404, "not found")
        try:
            fn(q)
        except PermissionError as e:
            self.error(403, str(e))
        except FileNotFoundError:
            self.error(404, "file not found")
        except (ValueError, OSError) as e:
            self.error(400, str(e))

    # ---------- pages ----------
    def serve_index(self, q):
        body = (WEB_DIR / "index.html").read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        tok = q.get("t")
        if tok and secrets.compare_digest(tok, self.hub.token):
            self.send_header("Set-Cookie", f"omni={tok}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000")
        self.end_headers()
        self.wfile.write(body)

    # ---------- api ----------
    def api_info(self, q):
        h = self.hub
        self.send_json({
            "name": h.name, "version": VERSION, "url": h.url,
            "os": f"{platform.system()} {platform.release()}",
            "root": str(h.root), "terminal": h.terminal,
            "devices": h.live_devices(), "peers": h.live_peers(),
            "you": self.client_address[0],
        })

    def api_list(self, q):
        p = self.hub.safe_path(q.get("path"))
        if not p.is_dir():
            raise ValueError("not a folder")
        items = []
        for c in p.iterdir():
            try:
                items.append(entry_info(self.hub, c))
            except OSError:
                pass
        items.sort(key=lambda e: (not e["dir"], e["name"].lower()))
        self.send_json({"path": self.hub.rel(p), "items": items})

    def api_download(self, q):
        p = self.hub.safe_path(q.get("path"))
        if not p.is_file():
            raise FileNotFoundError
        size = p.stat().st_size
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes=") and size:
            a, _, b = rng[6:].split(",")[0].partition("-")
            if a:
                start, end = int(a), min(int(b) if b else size - 1, size - 1)
            else:
                start = max(0, size - int(b))
            if start > end:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        disp = "inline" if q.get("inline") else "attachment"
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1 if size else 0))
        self.send_header("Content-Disposition",
                         f"{disp}; filename*=UTF-8''{urllib.parse.quote(p.name)}")
        self.end_headers()
        with p.open("rb") as f:
            f.seek(start)
            left = end - start + 1 if size else 0
            while left > 0:
                buf = f.read(min(CHUNK, left))
                if not buf:
                    break
                self.wfile.write(buf)
                left -= len(buf)

    def api_zip(self, q):
        p = self.hub.safe_path(q.get("path"))
        if not p.is_dir():
            raise ValueError("not a folder")
        with tempfile.TemporaryFile() as tmp:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
                for f in p.rglob("*"):
                    if f.is_file():
                        z.write(f, f.relative_to(p).as_posix())
            size = tmp.tell()
            tmp.seek(0)
            name = (p.name or "shared") + ".zip"
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition",
                             f"attachment; filename*=UTF-8''{urllib.parse.quote(name)}")
            self.end_headers()
            shutil.copyfileobj(tmp, self.wfile, CHUNK)

    def api_upload(self, q):
        folder = self.hub.safe_path(q.get("path"))
        name = Path(q.get("name", "")).name
        if not name or name in (".", ".."):
            raise ValueError("bad file name")
        folder.mkdir(parents=True, exist_ok=True)
        dest = self.hub.safe_path(self.hub.rel(folder) + "/" + name)
        if dest.exists() and not q.get("overwrite"):
            stem, suf, i = dest.stem, dest.suffix, 1
            while dest.exists():
                dest = dest.with_name(f"{stem} ({i}){suf}")
                i += 1
        left = int(self.headers.get("Content-Length") or 0)
        part = dest.with_name(dest.name + ".omnipart")
        try:
            with part.open("wb") as f:
                while left > 0:
                    buf = self.rfile.read(min(CHUNK, left))
                    if not buf:
                        raise ValueError("upload interrupted")
                    f.write(buf)
                    left -= len(buf)
            os.replace(part, dest)
        finally:
            if part.exists():
                part.unlink()
        self.send_json(entry_info(self.hub, dest))

    def api_mkdir(self, q):
        d = self.read_json()
        p = self.hub.safe_path(d.get("path", "") + "/" + Path(d.get("name", "")).name)
        p.mkdir(parents=True, exist_ok=True)
        self.send_json(entry_info(self.hub, p))

    def api_rename(self, q):
        d = self.read_json()
        src = self.hub.safe_path(d.get("path"))
        if src == self.hub.root:
            raise PermissionError("cannot rename the shared root")
        new = Path(d.get("name", "")).name
        if not new:
            raise ValueError("bad name")
        dst = self.hub.safe_path(self.hub.rel(src.parent) + "/" + new)
        if dst.exists():
            raise ValueError("a file with that name already exists")
        src.rename(dst)
        self.send_json(entry_info(self.hub, dst))

    def api_delete(self, q):
        d = self.read_json()
        p = self.hub.safe_path(d.get("path"))
        if p == self.hub.root:
            raise PermissionError("cannot delete the shared root")
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
        self.send_json({"ok": True})

    def api_clips(self, q):
        with self.hub.lock:
            self.send_json({"clips": list(self.hub.clips)})

    def api_add_clip(self, q):
        d = self.read_json()
        text = str(d.get("text", "")).strip()
        if not text:
            raise ValueError("empty text")
        self.hub.add_clip(text, describe_agent(self.headers.get("User-Agent", "")))
        self.send_json({"ok": True})

    def api_exec(self, q):
        if not self.hub.terminal:
            raise PermissionError("terminal is disabled - restart the hub with --terminal")
        d = self.read_json()
        cmd = str(d.get("cmd", "")).strip()
        cwd = Path(d.get("cwd") or self.hub.root)
        if not cwd.is_dir():
            cwd = self.hub.root
        # `cd` has to be handled here: each command runs in a fresh shell.
        if cmd == "cd" or cmd.startswith("cd "):
            target = cmd[2:].strip() or str(Path.home())
            new = (cwd / os.path.expanduser(target)).resolve()
            if not new.is_dir():
                return self.send_json({"output": f"cd: no such directory: {target}\n",
                                       "cwd": str(cwd), "code": 1})
            return self.send_json({"output": "", "cwd": str(new), "code": 0})
        try:
            r = subprocess.run(cmd, shell=True, cwd=str(cwd), capture_output=True,
                               timeout=int(d.get("timeout", 60)), stdin=subprocess.DEVNULL)
            out = (r.stdout + r.stderr).decode(errors="replace")
            code = r.returncode
        except subprocess.TimeoutExpired as e:
            out = ((e.stdout or b"") + (e.stderr or b"")).decode(errors="replace")
            out += "\n[timed out]\n"
            code = -1
        self.send_json({"output": out[-500000:], "cwd": str(cwd), "code": code})


# ---------- LAN discovery ----------
def discovery(hub, stop):
    """Broadcast our presence and collect other hubs on the same network."""
    msg = json.dumps({"omnibridge": VERSION, "name": hub.name, "url": hub.url}).encode()
    try:
        rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        rx.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                rx.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        rx.bind(("", DISCOVERY_PORT))
        rx.settimeout(1)
        tx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        tx.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    except OSError:
        return  # discovery is a bonus; the hub works without it
    last = 0
    while not stop.is_set():
        if time.time() - last > 5:
            try:
                tx.sendto(msg, ("<broadcast>", DISCOVERY_PORT))
            except OSError:
                pass
            last = time.time()
        try:
            data, _ = rx.recvfrom(4096)
            info = json.loads(data)
            # Only the base URL is shared; peers still need their own token.
            url = info.get("url", "").split("?")[0]
            if info.get("omnibridge") and url and url != hub.url.split("?")[0]:
                with hub.lock:
                    hub.peers[url] = {"name": info.get("name"), "url": url, "seen": time.time()}
        except (OSError, ValueError):
            pass


def print_qr(url):
    """Show a scannable QR code in the terminal when the optional qrcode lib exists."""
    try:
        import qrcode  # pip install qrcode
    except ImportError:
        print("  (tip: `pip install qrcode` to get a scannable QR code here)")
        return
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.print_ascii(invert=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description="OmniBridge - connect all your devices.")
    ap.add_argument("folder", nargs="?", default=str(Path.home() / "OmniBridge"),
                    help="folder to share (default: ~/OmniBridge)")
    ap.add_argument("-p", "--port", type=int, default=8765)
    ap.add_argument("-n", "--name", default=platform.node() or "OmniBridge")
    ap.add_argument("--token", help="fixed access token (default: random each start)")
    ap.add_argument("--terminal", action="store_true",
                    help="enable the remote web terminal (full shell access for anyone with the link)")
    ap.add_argument("--bind", default="0.0.0.0")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    Path(a.folder).mkdir(parents=True, exist_ok=True)
    hub = Hub(a.folder, a.name, a.token or secrets.token_urlsafe(12), a.terminal)
    Handler.hub = hub
    srv = ThreadingHTTPServer((a.bind, a.port), Handler)
    srv.daemon_threads = True
    srv.verbose = a.verbose
    hub.url = f"http://{local_ip()}:{srv.server_address[1]}/?t={hub.token}"

    stop = threading.Event()
    threading.Thread(target=discovery, args=(hub, stop), daemon=True).start()

    print(f"\n  OmniBridge {VERSION}  -  '{hub.name}'")
    print(f"  Sharing:  {hub.root}")
    print(f"  Terminal: {'ON (keep the link private!)' if hub.terminal else 'off (use --terminal)'}")
    print("\n  Open this link on any phone, tablet or computer on the same Wi-Fi:\n")
    print(f"    {hub.url}\n")
    print_qr(hub.url)
    print("  Press Ctrl+C to stop.\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
    finally:
        stop.set()
        srv.server_close()


if __name__ == "__main__":
    main()
