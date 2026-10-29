# Robotea: no-cache static dev server for the project root (localhost only)
import functools, http.server, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
        '.hdr': 'application/octet-stream', '.woff2': 'font/woff2', '.json': 'application/json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8895
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=ROOT)).serve_forever()
