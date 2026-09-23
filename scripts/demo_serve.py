"""Put the whole demo on one public HTTPS link.

    python scripts/demo_serve.py

Builds the web app, serves it and the API from one process on :8100, opens a Cloudflare tunnel and
prints the link. Open that link on the laptop and both phones and all three see the same worksite,
because there is one backend behind them.

**Why a tunnel rather than the laptop's LAN address.** Browsers only hand out
``navigator.geolocation`` on a secure context - HTTPS, or localhost. Over ``http://192.168.x.x`` the
phones return no position at all and every punch records as ``unverified`` instead of inside or
outside the geofence, so the whole geofence story looks broken rather than blocked. A tunnel is
HTTPS, so it works. It also saves the phones having to be on the same wifi as the laptop at all.

**What this does not carry.** MQTT (the in-cab live telemetry stream) and the edge API on :8000 stay
local: the Task Centre does not use either. The in-cab pages will load through the link but their
live feed will not.

**While it runs.** The link lives only as long as this process and the laptop's own connection. A
free quick tunnel takes a new random name every restart, so start it once and leave it; press
Ctrl-C to stop everything.
"""
from __future__ import annotations

import argparse
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DIST = WEB / "dist"
PORT = 8100

#: cloudflared announces the quick tunnel on stderr, inside a box, once it is up.
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def _say(msg: str = "") -> None:
    print(msg, flush=True)


def _rule(char: str = "-") -> None:
    _say(char * 72)


def build_web(skip: bool) -> None:
    """`npm run build` picks up web/.env.production, which points the app at its own origin."""
    if skip:
        _say("· skipping the web build (--no-build)")
        if not (DIST / "index.html").is_file():
            sys.exit("web/dist is not built and --no-build was passed. Drop the flag and re-run.")
        return
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if npm is None:
        sys.exit("npm is not on PATH, so the web app cannot be built here.")
    _say("· building the web app …")
    r = subprocess.run([npm, "run", "build"], cwd=WEB, capture_output=True, text=True)
    if r.returncode != 0:
        _say(r.stdout[-3000:])
        _say(r.stderr[-3000:])
        sys.exit("the web build failed; nothing was started.")
    _say("  built.")


def start_api() -> subprocess.Popen[str]:
    """Serve the API and the built app together, so the demo is one origin and one link."""
    _say(f"· starting the API and web app on :{PORT} …")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "sentinel.cloud.api.main:app",
         "--host", "127.0.0.1", "--port", str(PORT), "--log-level", "warning"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    threading.Thread(target=_drain, args=(proc, "api"), daemon=True).start()
    return proc


def wait_for_api(timeout_s: float = 90.0) -> None:
    """Wait for the app to answer. The first start seeds demo fixtures and is not quick."""
    import urllib.error
    import urllib.request
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/v1/health", timeout=2) as r:
                if r.status == 200:
                    _say("  API is up.")
                    return
        except (urllib.error.URLError, OSError, TimeoutError):
            time.sleep(1.0)
    sys.exit(f"the API did not answer on :{PORT} within {timeout_s:.0f}s.")


def start_tunnel() -> tuple[subprocess.Popen[str], str]:
    """Open the quick tunnel and return it with the public URL it prints."""
    exe = shutil.which("cloudflared")
    if exe is None:
        sys.exit("cloudflared is not on PATH. Install it, or serve on the LAN with --no-tunnel "
                 "(note that geolocation will not work over plain http).")
    _say("· opening the Cloudflare tunnel …")
    proc = subprocess.Popen([exe, "tunnel", "--url", f"http://127.0.0.1:{PORT}"],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    url = ""
    deadline = time.time() + 60
    assert proc.stdout is not None
    for line in proc.stdout:
        found = URL_RE.search(line)
        if found:
            url = found.group(0)
            break
        if time.time() > deadline or proc.poll() is not None:
            break
    if not url:
        proc.terminate()
        sys.exit("the tunnel did not report a URL. Check your internet connection and try again.")
    threading.Thread(target=_drain, args=(proc, "tunnel"), daemon=True).start()
    return proc, url


def _drain(proc: subprocess.Popen[str], label: str) -> None:
    """Keep the child's pipe empty; a full pipe blocks the child. Only errors are surfaced."""
    if proc.stdout is None:
        return
    for line in proc.stdout:
        low = line.lower()
        if "error" in low or "failed" in low:
            _say(f"  [{label}] {line.rstrip()}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve the demo on one public HTTPS link.")
    ap.add_argument("--no-build", action="store_true", help="use the existing web/dist")
    ap.add_argument("--no-tunnel", action="store_true", help="serve locally only, no public link")
    args = ap.parse_args()

    _say()
    _rule("=")
    _say("  CAT Sentinel — demo server")
    _rule("=")

    build_web(args.no_build)
    api = start_api()
    procs = [api]
    try:
        wait_for_api()
        local = f"http://127.0.0.1:{PORT}/tc"
        if args.no_tunnel:
            public = ""
        else:
            tunnel, url = start_tunnel()
            procs.append(tunnel)
            public = f"{url}/tc"

        _say()
        _rule("=")
        if public:
            _say("  OPEN THIS ON EVERY DEVICE:")
            _say()
            _say(f"      {public}")
            _say()
            _say("  Laptop, both phones — same link, same worksite. Mobile data is fine;")
            _say("  the phones do not need to be on your wifi.")
        else:
            _say(f"  Local only: {local}")
        _rule("=")
        _say()
        _say("  Sign in:  admin / admin123   ·   super1 / super123   ·   op1 / op123")
        _say()
        _say("  The link lives only while this window is open and the laptop is online.")
        _say("  Ctrl-C stops everything.")
        _say()

        while all(p.poll() is None for p in procs):
            time.sleep(1.0)
        _say("a child process exited; shutting the rest down.")
    except KeyboardInterrupt:
        _say("\nstopping …")
    finally:
        for p in procs:
            if p.poll() is None:
                p.send_signal(signal.SIGTERM)
        for p in procs:
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()
        _say("stopped.")


if __name__ == "__main__":
    main()
