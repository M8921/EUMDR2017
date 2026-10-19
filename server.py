"""Local server for the classification engine and the global alerts tracker.

    python server.py            -> http://localhost:8000

Serves the pages in this folder and adds two endpoints for the alerts page:
    POST /api/refresh   re-collect alerts from all regulators (runs in the background)
    GET  /api/status    whether a refresh is running, and when alerts were last collected
Alerts are collected at start-up when alerts/alerts.json is missing or older than 6 hours.
Standard library only; listens on this computer only (127.0.0.1).
"""

import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "alerts"))
import collector  # noqa: E402

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
STALE_SECONDS = 6 * 3600
state = {"running": False, "last_error": ""}
lock = threading.Lock()


def refresh():
    with lock:
        if state["running"]:
            return False
        state["running"] = True

    def work():
        try:
            config = json.loads(collector.SOURCES.read_text(encoding="utf-8"))
            result = collector.collect(config)
            collector.OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
            state["last_error"] = ""
            ok = sum(1 for s in result["sources"] if s["ok"])
            print(f"Alerts refreshed: {len(result['items'])} items from {ok}/{len(result['sources'])} sources")
        except Exception as exc:
            state["last_error"] = f"{type(exc).__name__}: {exc}"
            print("Alerts refresh failed:", state["last_error"])
        finally:
            state["running"] = False

    threading.Thread(target=work, daemon=True).start()
    return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def status(self):
        out = collector.OUTPUT
        return {
            "running": state["running"],
            "last_error": state["last_error"],
            "collected_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(out.stat().st_mtime)) if out.exists() else None,
        }

    def do_GET(self):
        if self.path.startswith("/api/status"):
            return self.send_json(self.status())
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/refresh"):
            started = refresh()
            return self.send_json(dict(self.status(), started=started), 202)
        self.send_error(404)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


def main():
    out = collector.OUTPUT
    if not out.exists() or time.time() - out.stat().st_mtime > STALE_SECONDS:
        print("Collecting alerts from regulators in the background...")
        refresh()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Classification engine: http://localhost:{PORT}/")
    print(f"Global alerts:         http://localhost:{PORT}/alerts.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
