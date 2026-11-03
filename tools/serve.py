"""Serves the game locally and tells the browser never to cache anything, so a
refresh always shows the latest code. Run: python3 tools/serve.py [port]"""
import http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8127
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
