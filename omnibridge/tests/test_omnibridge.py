import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import omnibridge as ob  # noqa: E402


class OmniBridgeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.root = Path(cls.dir.name) / "share"
        cls.root.mkdir()
        (Path(cls.dir.name) / "outside.txt").write_text("secret")
        ob.Handler.hub = ob.Hub(cls.root, "test", "tok", terminal=True)
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), ob.Handler)
        cls.srv.verbose = False
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.dir.cleanup()

    def req(self, path, data=None, method=None, token="tok", raw=False, headers=None):
        h = {"X-Token": token} if token else {}
        h.update(headers or {})
        if isinstance(data, dict):
            data = json.dumps(data).encode()
            h["Content-Type"] = "application/json"
        r = urllib.request.urlopen(urllib.request.Request(self.base + path, data=data, method=method, headers=h))
        body = r.read()
        return body if raw else json.loads(body)

    def code(self, *a, **k):
        try:
            self.req(*a, **k)
            return 200
        except urllib.error.HTTPError as e:
            return e.code

    def test_auth_required(self):
        self.assertEqual(self.code("/api/list", token=None), 401)
        self.assertEqual(self.code("/api/list", token="wrong"), 401)
        self.assertEqual(self.req("/api/ping", token=None)["name"], "test")

    def test_upload_list_download(self):
        self.req("/api/upload?path=docs&name=hello.txt", data=b"hello phone", method="PUT")
        items = self.req("/api/list?path=docs")["items"]
        self.assertEqual([i["name"] for i in items], ["hello.txt"])
        self.assertEqual(self.req("/api/download?path=docs/hello.txt", raw=True), b"hello phone")
        part = self.req("/api/download?path=docs/hello.txt", raw=True, headers={"Range": "bytes=6-"})
        self.assertEqual(part, b"phone")
        # A second upload with the same name must not overwrite.
        self.req("/api/upload?path=docs&name=hello.txt", data=b"v2", method="PUT")
        names = sorted(i["name"] for i in self.req("/api/list?path=docs")["items"])
        self.assertEqual(names, ["hello (1).txt", "hello.txt"])

    def test_path_traversal_blocked(self):
        self.assertEqual(self.code("/api/download?path=../outside.txt"), 403)
        self.assertEqual(self.code("/api/list?path=../../"), 403)
        self.assertEqual(self.code("/api/delete", data={"path": ""}), 403)
        # Upload names are reduced to their base name.
        self.req("/api/upload?path=&name=../../evil.txt", data=b"x", method="PUT")
        self.assertTrue((self.root / "evil.txt").exists())
        self.assertFalse((Path(self.dir.name) / "evil.txt").exists())

    def test_mkdir_rename_delete_zip(self):
        self.req("/api/mkdir", data={"path": "", "name": "music"})
        self.req("/api/upload?path=music&name=a.mp3", data=b"abc", method="PUT")
        self.req("/api/rename", data={"path": "music/a.mp3", "name": "b.mp3"})
        self.assertTrue((self.root / "music" / "b.mp3").exists())
        z = self.req("/api/zip?path=music", raw=True)
        self.assertTrue(z.startswith(b"PK"))
        self.req("/api/delete", data={"path": "music"})
        self.assertFalse((self.root / "music").exists())

    def test_clipboard(self):
        self.req("/api/clips", data={"text": "https://example.com"})
        clips = self.req("/api/clips")["clips"]
        self.assertEqual(clips[-1]["text"], "https://example.com")

    def test_terminal(self):
        r = self.req("/api/exec", data={"cmd": "echo omni", "cwd": str(self.root)})
        self.assertEqual(r["output"].strip(), "omni")
        r = self.req("/api/exec", data={"cmd": "cd ..", "cwd": str(self.root)})
        self.assertEqual(Path(r["cwd"]), self.root.parent)

    def test_terminal_disabled(self):
        ob.Handler.hub.terminal = False
        try:
            self.assertEqual(self.code("/api/exec", data={"cmd": "echo hi"}), 403)
        finally:
            ob.Handler.hub.terminal = True


if __name__ == "__main__":
    unittest.main()
