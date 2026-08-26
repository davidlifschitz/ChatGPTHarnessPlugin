import contextlib
import io
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from tools.hermes_probe import HermesProbe, ProbeError, build_parser, main


class ProbeHandler(BaseHTTPRequestHandler):
    api_key = "super-secret-probe-key"
    seen_auth = []
    seen_chat = None

    def log_message(self, format, *args):
        pass

    def _authorized(self):
        auth = self.headers.get("Authorization")
        self.__class__.seen_auth.append(auth)
        return auth == f"Bearer {self.api_key}"

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self._authorized():
            self._json(401, {"error": f"bad credential {self.api_key}"})
            return
        if self.path == "/v1/capabilities":
            self._json(200, {"runs": True, "sessions": True})
            return
        if self.path == "/api/sessions":
            self._json(200, [{"id": "sess-1", "title": "Existing"}])
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._authorized():
            self._json(401, {"error": f"bad credential {self.api_key}"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/v1/chat/completions":
            self.__class__.seen_chat = payload
            self._json(
                200,
                {"choices": [{"message": {"role": "assistant", "content": "probe-ok"}}]},
            )
            return
        self._json(404, {"error": "not found"})


class HermesProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        host, port = cls.server.server_address
        cls.base_url = f"http://{host}:{port}/"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        ProbeHandler.seen_auth = []
        ProbeHandler.seen_chat = None

    def test_read_only_report_reads_capabilities_and_sessions(self):
        probe = HermesProbe(self.base_url, ProbeHandler.api_key)
        report = probe.read_only_report()
        self.assertEqual(report["base_url"], self.base_url.rstrip("/"))
        self.assertEqual(report["capabilities"], {"runs": True, "sessions": True})
        self.assertEqual(report["sessions"], [{"id": "sess-1", "title": "Existing"}])
        self.assertEqual(
            ProbeHandler.seen_auth,
            [
                f"Bearer {ProbeHandler.api_key}",
                f"Bearer {ProbeHandler.api_key}",
            ],
        )
        self.assertNotIn(ProbeHandler.api_key, json.dumps(report))

    def test_read_only_report_marks_missing_sessions_api_unsupported(self):
        class NoSessionsHandler(ProbeHandler):
            def do_GET(self):
                if not self._authorized():
                    self._json(401, {"error": "unauthorized"})
                    return
                if self.path == "/v1/capabilities":
                    self._json(200, {"sessions": False})
                    return
                if self.path == "/api/sessions":
                    self._json(404, {"error": "not found"})
                    return
                self._json(404, {"error": "not found"})

        server = ThreadingHTTPServer(("127.0.0.1", 0), NoSessionsHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host, port = server.server_address
        try:
            probe = HermesProbe(f"http://{host}:{port}", ProbeHandler.api_key)
            report = probe.read_only_report()
            self.assertFalse(report["sessions_supported"])
            self.assertIsNone(report["sessions"])
            self.assertEqual(report["capabilities"], {"sessions": False})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_chat_is_explicit_and_uses_hermes_agent_model(self):
        probe = HermesProbe(self.base_url, ProbeHandler.api_key)
        response = probe.chat("Reply with exactly: probe-ok")
        self.assertEqual(response["choices"][0]["message"]["content"], "probe-ok")
        self.assertEqual(ProbeHandler.seen_chat["model"], "hermes-agent")
        self.assertEqual(
            ProbeHandler.seen_chat["messages"],
            [{"role": "user", "content": "Reply with exactly: probe-ok"}],
        )

    def test_probe_error_redacts_supplied_key_if_upstream_echoes_it(self):
        supplied = "echo-me-never"

        class EchoHandler(ProbeHandler):
            def do_GET(self):
                self._json(401, {"error": f"credential was {supplied}"})

        server = ThreadingHTTPServer(("127.0.0.1", 0), EchoHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host, port = server.server_address
        try:
            probe = HermesProbe(f"http://{host}:{port}", supplied)
            with self.assertRaises(ProbeError) as ctx:
                probe.get_json("/v1/capabilities")
            message = str(ctx.exception)
            self.assertNotIn(supplied, message)
            self.assertIn("[REDACTED]", message)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_parser_does_not_enable_chat_without_chat_argument(self):
        parser = build_parser()
        args = parser.parse_args(["--base-url", "https://example.invalid"])
        self.assertIsNone(args.chat)

    def test_main_requires_api_key(self):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch.dict(os.environ, {}, clear=True):
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = main(["--base-url", "https://example.invalid"])
        self.assertEqual(code, 2)
        self.assertIn("HERMES_API_KEY", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
