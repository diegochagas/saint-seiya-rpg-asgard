#!/usr/bin/env python3
"""Tiny no-cache static server for local development.

Usage: python engine/tools/serve.py [port] [directory]   (directory: default the current folder)
"""
import http.server
import os
import sys
import threading


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # The game's "Exit" command asks the dev server to stop.
        if self.path == "/__exit":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"bye")
            print("Exit requested by the game, stopping server.", flush=True)
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        self.send_error(404)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter
        if "404" in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    directory = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()   # run from the game repo root
    os.chdir(directory)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print("Serving %s on http://127.0.0.1:%d (Ctrl+C or the game's Exit to stop)" % (directory, port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()
