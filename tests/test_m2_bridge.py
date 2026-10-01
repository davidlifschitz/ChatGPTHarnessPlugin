import importlib.util
import os
import pathlib
import unittest
from unittest.mock import patch


BRIDGE_PATH = pathlib.Path(__file__).resolve().parents[1] / "runtime" / "hermes" / "bridge.py"


def load_bridge_module():
    with patch.dict(
        os.environ,
        {
            "API_SERVER_KEY": "internal-test-key",
            "HERMES_BRIDGE_KEY": "bridge-test-key",
            "API_SERVER_PORT": "8642",
            "PORT": "10000",
        },
        clear=False,
    ):
        spec = importlib.util.spec_from_file_location("m2_bridge_test_module", BRIDGE_PATH)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module


class BridgeBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = load_bridge_module()

    def handler(self, method, path, authorization="Bearer bridge-test-key"):
        instance = object.__new__(self.bridge.BridgeHandler)
        instance.command = method
        instance.path = path
        instance.headers = {"Authorization": authorization}
        return instance

    def test_bridge_auth_requires_exact_bearer_secret(self):
        self.assertTrue(self.handler("GET", "/v1/models")._authorized())
        self.assertFalse(self.handler("GET", "/v1/models", "Bearer wrong")._authorized())
        self.assertFalse(self.handler("GET", "/v1/models", "")._authorized())

    def test_read_only_capability_routes_are_allowlisted(self):
        self.assertTrue(self.handler("GET", "/v1/capabilities")._route_allowed())
        self.assertTrue(self.handler("GET", "/v1/models")._route_allowed())
        self.assertTrue(self.handler("GET", "/api/sessions?limit=1&offset=0")._route_allowed())

    def test_exact_session_routes_are_allowlisted(self):
        sid = "api_123.test:@-ok"
        self.assertTrue(self.handler("POST", "/api/sessions")._route_allowed())
        self.assertTrue(self.handler("POST", f"/api/sessions/{sid}/chat")._route_allowed())
        self.assertTrue(self.handler("GET", f"/api/sessions/{sid}")._route_allowed())
        self.assertTrue(
            self.handler(
                "GET",
                f"/api/sessions/{sid}/messages?limit=200&offset=0&order=latest",
            )._route_allowed()
        )

    def test_unneeded_hermes_routes_and_mutations_are_blocked(self):
        self.assertFalse(self.handler("GET", "/api/config")._route_allowed())
        self.assertFalse(self.handler("GET", "/api/env")._route_allowed())
        self.assertFalse(self.handler("GET", "/v1/runs/run_123")._route_allowed())
        self.assertFalse(self.handler("DELETE", "/api/sessions/api_123")._route_allowed())
        self.assertFalse(self.handler("PATCH", "/api/sessions/api_123")._route_allowed())
        self.assertFalse(self.handler("PUT", "/api/config")._route_allowed())

    def test_session_query_parameters_fail_closed(self):
        self.assertFalse(self.handler("GET", "/api/sessions")._route_allowed())
        self.assertFalse(self.handler("GET", "/api/sessions?limit=200&offset=0")._route_allowed())
        self.assertFalse(
            self.handler(
                "GET",
                "/api/sessions/api_123/messages?limit=500&offset=0&order=latest",
            )._route_allowed()
        )


if __name__ == "__main__":
    unittest.main()
