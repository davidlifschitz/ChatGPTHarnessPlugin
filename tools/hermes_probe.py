#!/usr/bin/env python3
"""Small upstream-first verifier for a Hermes Agent API server."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class ProbeError(RuntimeError):
    """A sanitized failure while talking to Hermes."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class HermesProbe:
    def __init__(self, base_url: str, api_key: str, timeout: float = 10.0) -> None:
        base_url = base_url.strip().rstrip("/")
        api_key = api_key.strip()
        if not base_url:
            raise ValueError("base_url must not be empty")
        if not api_key:
            raise ValueError("api_key must not be empty")
        self.base_url = base_url
        self.api_key = api_key
        self.timeout = timeout

    def _sanitize(self, text: str) -> str:
        return text.replace(self.api_key, "[REDACTED]")

    def _request_json(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        if not path.startswith("/"):
            path = f"/{path}"
        body = None
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(
            f"{self.base_url}{path}",
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            try:
                raw_error = exc.read().decode("utf-8", errors="replace")
            except Exception:
                raw_error = ""
            detail = self._sanitize(raw_error)
            suffix = f": {detail}" if detail else ""
            raise ProbeError(
                f"Hermes returned HTTP {exc.code} for {path}{suffix}",
                status_code=exc.code,
            ) from None
        except (URLError, TimeoutError, socket.timeout) as exc:
            raise ProbeError(
                self._sanitize(f"Could not reach Hermes at {self.base_url}{path}: {exc}")
            ) from None

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProbeError(
                f"Hermes returned non-JSON data for {path}: {self._sanitize(raw[:200])}"
            ) from exc

    def get_json(self, path: str) -> Any:
        return self._request_json("GET", path)

    def read_only_report(self) -> dict[str, Any]:
        capabilities = self.get_json("/v1/capabilities")
        try:
            sessions = self.get_json("/api/sessions")
            sessions_supported = True
        except ProbeError as exc:
            if exc.status_code != 404:
                raise
            sessions = None
            sessions_supported = False

        return {
            "base_url": self.base_url,
            "capabilities": capabilities,
            "sessions_supported": sessions_supported,
            "sessions": sessions,
        }

    def chat(self, message: str) -> Any:
        if not message.strip():
            raise ValueError("message must not be empty")
        return self._request_json(
            "POST",
            "/v1/chat/completions",
            {
                "model": "hermes-agent",
                "messages": [{"role": "user", "content": message}],
            },
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Verify a Hermes API server before building custom product infrastructure."
    )
    parser.add_argument("--base-url", required=True, help="Hermes API server origin")
    parser.add_argument(
        "--api-key",
        help="Hermes API key. Prefer HERMES_API_KEY so it is not stored in shell history.",
    )
    parser.add_argument(
        "--chat",
        metavar="MESSAGE",
        help="Explicitly run one real chat completion after the read-only checks.",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="HTTP timeout in seconds (default: 10).",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    api_key = args.api_key or os.environ.get("HERMES_API_KEY", "")
    if not api_key.strip():
        print(
            "Missing Hermes API key. Set HERMES_API_KEY or pass --api-key.",
            file=sys.stderr,
        )
        return 2

    try:
        probe = HermesProbe(args.base_url, api_key, timeout=args.timeout)
        report = probe.read_only_report()
        print(json.dumps(report, indent=2, sort_keys=True))
        if args.chat is not None:
            response = probe.chat(args.chat)
            print(json.dumps({"chat": response}, indent=2, sort_keys=True))
    except (ProbeError, ValueError) as exc:
        print(f"Probe failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
