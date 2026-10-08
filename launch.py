import os
import sys
import webbrowser
import http.server
import socketserver
import threading
import time

PORT = 8500
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

def start_server():
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving Trello Timeline at http://localhost:{PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    t = threading.Thread(target=start_server, daemon=True)
    t.start()
    time.sleep(0.5)
    url = f"http://localhost:{PORT}/index.html"
    print(f"Opening browser at: {url}")
    webbrowser.open(url)
    
    # Keep server alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Server stopped.")
