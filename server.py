#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
from urllib.parse import urlparse, parse_qs

PORT = 5000

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # API endpoint pour fournir la configuration Firebase
        if self.path == '/api/firebase-config':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            config = {
                'apiKey': os.environ.get('FIREBASE_API_KEY', ''),
                'authDomain': os.environ.get('FIREBASE_AUTH_DOMAIN', ''),
                'projectId': os.environ.get('FIREBASE_PROJECT_ID', ''),
                'storageBucket': os.environ.get('FIREBASE_STORAGE_BUCKET', ''),
                'messagingSenderId': os.environ.get('FIREBASE_MESSAGING_SENDER_ID', ''),
                'appId': os.environ.get('FIREBASE_APP_ID', ''),
                'measurementId': os.environ.get('FIREBASE_MEASUREMENT_ID', '')
            }
            
            self.wfile.write(json.dumps(config).encode())
        else:
            # Servir les fichiers statiques normalement
            super().do_GET()
    
    def end_headers(self):
        # Désactiver le cache pour faciliter le développement
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReusableTCPServer(("0.0.0.0", PORT), CustomHandler) as httpd:
    print(f"Serveur démarré sur le port {PORT}")
    print(f"Accédez à l'application sur http://0.0.0.0:{PORT}")
    httpd.serve_forever()
