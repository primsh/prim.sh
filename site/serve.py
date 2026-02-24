import http.server
import os
import socketserver

BASE = os.path.dirname(os.path.abspath(__file__))
ROUTES = {
    "/": os.path.join(BASE, "agentstack", "index.html"),
    "/wallet": os.path.join(BASE, "wallet", "index.html"),
    "/spawn": os.path.join(BASE, "spawn", "index.html"),
    "/store": os.path.join(BASE, "store", "index.html"),
    "/vault": os.path.join(BASE, "vault", "index.html"),
    "/dns": os.path.join(BASE, "dns", "index.html"),
    "/relay": os.path.join(BASE, "relay", "index.html"),
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
    def do_GET(self) -> None:
        p = self.path.rstrip("/") or "/"
        f = ROUTES.get(p)
        if f and os.path.exists(f):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(f, "rb") as fh:
                self.wfile.write(fh.read())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *_args: object, **_kwargs: object) -> None:
        return


socketserver.TCPServer(("100.91.44.60", 8892), H).serve_forever()

