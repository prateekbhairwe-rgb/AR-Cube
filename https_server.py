import http.server
import ssl
import os
import subprocess
import sys

PORT = 4443

def generate_self_signed_cert():
    """Generates a self-signed certificate using OpenSSL."""
    if not os.path.exists("key.pem") or not os.path.exists("cert.pem"):
        print("🔒 Generating self-signed certificate...")
        try:
            subprocess.check_call([
                "openssl", "req", "-x509", "-newkey", "rsa:2048",
                "-keyout", "key.pem", "-out", "cert.pem",
                "-days", "365", "-nodes",
                "-subj", "/C=US/ST=State/L=City/O=Organization/CN=localhost"
            ])
            print("✅ Certificate generated.")
        except FileNotFoundError:
            print("❌ Error: OpenSSL not found. Please install OpenSSL or generate 'key.pem' and 'cert.pem' manually.")
            sys.exit(1)

def run_server():
    generate_self_signed_cert()

    server_address = ('0.0.0.0', PORT)
    httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print("="*60)
    print(f"🚀 HTTPS Server running on https://0.0.0.0:{PORT}")
    print(f"📱 Access on phone via: https://<YOUR_LAPTOP_IP>:{PORT}/threejscube.html")
    print("⚠️  You will see a security warning. Click 'Advanced' -> 'Proceed'.")
    print("="*60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped.")

if __name__ == '__main__':
    run_server()
