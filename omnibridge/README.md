# OmniBridge

Connect every device you own (Android, iPhone, iPad, Windows, Mac, Linux, Chromebook) and
move files and text between them. Run it on one machine; every other device just opens a
link in its browser. Nothing to install on the phones, no cloud, no account.

## Start it

```sh
python3 omnibridge.py                 # shares ~/OmniBridge
python3 omnibridge.py ~/Downloads     # share a specific folder
python3 omnibridge.py --terminal      # also enable the remote web terminal
```

It prints a link like `http://192.168.1.20:8765/?t=Xy12...`. Open it on any device on the
same Wi-Fi. (`pip install qrcode` makes it print a QR code you can scan with a phone camera.)

Runs anywhere Python 3.8+ runs: Windows, macOS, Linux, **Android** (Termux:
`pkg install python`), **iPhone/iPad** (a-Shell or Pyto apps). No other dependencies.

## Features

- **Files:** browse, upload many files at once (drag and drop, any size, streamed to disk),
  download, resume (HTTP Range), download whole folders as .zip, rename, delete, new folder
- **Shared clipboard:** send text or links to all connected devices instantly
- **Devices:** see every connected device and other OmniBridge hubs found on the network
- **Web terminal** (`--terminal`): run shell commands on the host from your phone

## Security

- Every request needs the random access token in the link (stored as an HttpOnly cookie).
- All file paths are confined to the shared folder; `..` tricks are rejected.
- The terminal is **off by default**. When enabled, anyone with the link has a shell, so
  share the link only with your own devices.
- Traffic is plain HTTP on your local network; don't run it on untrusted public Wi-Fi.

## Tests

```sh
python3 -m unittest tests/test_omnibridge.py
```
