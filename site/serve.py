import http.server
import os
import socketserver
from typing import Optional
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
ROUTES = {
    "/": os.path.join(BASE, "agentstack", "index.html"),
    "/wallet": os.path.join(BASE, "wallet", "index.html"),
    "/spawn": os.path.join(BASE, "spawn", "index.html"),
    "/store": os.path.join(BASE, "store", "index.html"),
    "/vault": os.path.join(BASE, "vault", "index.html"),
    "/dns": os.path.join(BASE, "dns", "index.html"),
    "/email": os.path.join(BASE, "email", "index.html"),
    "/ring": os.path.join(BASE, "ring", "index.html"),
    "/cron": os.path.join(BASE, "cron", "index.html"),
    "/pipe": os.path.join(BASE, "pipe", "index.html"),
    "/pay": os.path.join(BASE, "pay", "index.html"),
    "/mem": os.path.join(BASE, "mem", "index.html"),
    "/infer": os.path.join(BASE, "infer", "index.html"),
    "/watch": os.path.join(BASE, "watch", "index.html"),
    "/browse": os.path.join(BASE, "browse", "index.html"),
    "/auth": os.path.join(BASE, "auth", "index.html"),
    "/code": os.path.join(BASE, "code", "index.html"),
    "/trace": os.path.join(BASE, "trace", "index.html"),
    "/docs": os.path.join(BASE, "docs", "index.html"),
    "/pins": os.path.join(BASE, "pins", "index.html"),
    "/seek": os.path.join(BASE, "seek", "index.html"),
    "/mart": os.path.join(BASE, "mart", "index.html"),
    "/hive": os.path.join(BASE, "hive", "index.html"),
    "/ads": os.path.join(BASE, "ads", "index.html"),
    "/ship": os.path.join(BASE, "ship", "index.html"),
    "/hands": os.path.join(BASE, "hands", "index.html"),
    "/id": os.path.join(BASE, "id", "index.html"),
    "/corp": os.path.join(BASE, "corp", "index.html"),
}


class H(http.server.BaseHTTPRequestHandler):
    def _resolve_file(self, path: str) -> Optional[str]:
        f = ROUTES.get(path)
        if f and os.path.exists(f):
            return f

        if path == "/llms.txt":
            f = os.path.join(BASE, "llms.txt")
            return f if os.path.exists(f) else None

        if path.endswith("/llms.txt"):
            parts = path.strip("/").split("/")
            if len(parts) == 2:
                primitive = parts[0]
                f = os.path.join(BASE, primitive, "llms.txt")
                return f if os.path.exists(f) else None

        return None

    def _content_type(self, file_path: str) -> str:
        if file_path.endswith(".html"):
            return "text/html; charset=utf-8"
        if file_path.endswith(".txt"):
            return "text/plain; charset=utf-8"
        return "application/octet-stream"

    def do_GET(self) -> None:
        raw_path = urlparse(self.path).path
        p = raw_path.rstrip("/") or "/"
        f = self._resolve_file(p)
        if f:
            self.send_response(200)
            self.send_header("Content-Type", self._content_type(f))
            self.end_headers()
            with open(f, "rb") as fh:
                self.wfile.write(fh.read())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *_args: object, **_kwargs: object) -> None:
        return


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


ReusableTCPServer(("0.0.0.0", 8892), H).serve_forever()
