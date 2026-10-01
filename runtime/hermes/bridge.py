#!/usr/bin/env python3
"""Narrow authenticated ingress bridge for the M2 Hermes runtime."""

from __future__ import annotations

import http.client
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 2 * 1024 * 1024
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = int(os.environ.get("API_SERVER_PORT", "8642"))
PUBLIC_PORT = int(os.environ.get("PORT", "10000"))
UPSTREAM_KEY = os.environ.get("API_SERVER_KEY", "")
BRIDGE_KEY = os.environ.get("HERMES_BRIDGE_KEY", "")

if not UPSTREAM_KEY or not BRIDGE_KEY:
    raise SystemExit("M2 bridge credentials are not configured.")


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "HermesM2Bridge/1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def _json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        return self.headers.get("Authorization", "") == f"Bearer {BRIDGE_KEY}"

    def _health(self) -> None:
        connection = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=3)
        try:
            connection.request(
                "GET",
                "/health",
                headers={"Authorization": f"Bearer {UPSTREAM_KEY}", "Accept": "application/json"},
            )
            response = connection.getresponse()
            response.read()
            if 200 <= response.status < 300:
                self._json(200, {"status": "ok"})
            else:
                self._json(503, {"status": "starting"})
        except (OSError, TimeoutError, http.client.HTTPException):
            self._json(503, {"status": "starting"})
        finally:
            connection.close()

    def _proxy(self) -> None:
        if not self._authorized():
            self._json(401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "invalid_content_length"})
            return
        if length < 0 or length > MAX_BODY_BYTES:
            self._json(413, {"error": "request_too_large"})
            return

        body = self.rfile.read(length) if length else None
        headers = {
            "Authorization": f"Bearer {UPSTREAM_KEY}",
            "Accept": self.headers.get("Accept", "application/json"),
        }
        content_type = self.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type
        session_key = self.headers.get("X-Hermes-Session-Key")
        if session_key:
            headers["X-Hermes-Session-Key"] = session_key

        connection = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=75)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            upstream = connection.getresponse()
            response_body = upstream.read(MAX_BODY_BYTES + 1)
            if len(response_body) > MAX_BODY_BYTES:
                self._json(502, {"error": "upstream_response_too_large"})
                return

            self.send_response(upstream.status)
            for name in (
                "Content-Type",
                "Cache-Control",
                "X-Hermes-Session-Id",
                "X-Hermes-Session-Key",
            ):
                value = upstream.getheader(name)
                if value:
                    self.send_header(name, value)
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            if response_body:
                self.wfile.write(response_body)
        except (OSError, TimeoutError, http.client.HTTPException):
            self._json(502, {"error": "hermes_upstream_unavailable"})
        finally:
            connection.close()

    def do_GET(self) -> None:
        if self.path in ("/health", "/health/"):
            self._health()
            return
        self._proxy()

    def do_POST(self) -> None:
        self._proxy()

    def do_PATCH(self) -> None:
        self._proxy()

    def do_PUT(self) -> None:
        self._proxy()

    def do_DELETE(self) -> None:
        self._proxy()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PUBLIC_PORT), BridgeHandler)
    server.serve_forever()
