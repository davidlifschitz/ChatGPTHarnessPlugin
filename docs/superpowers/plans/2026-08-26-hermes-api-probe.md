# Hermes API Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, testable command-line probe that verifies which supported Hermes HTTP surfaces are reachable on a configured real deployment before the project builds any custom consumer backend.

**Architecture:** Use Python 3 standard-library HTTP and `unittest` only, so the probe introduces no application framework or product-stack commitment. The probe is read-only by default; a real model turn requires an explicit `--chat` flag and message. Credentials come only from environment/CLI input and are never printed.

**Tech Stack:** Python 3.11+ standard library (`argparse`, `json`, `urllib.request`, `unittest`, `http.server`).

**Spec:** `docs/superpowers/specs/2026-08-26-thin-hermes-consumer-layer-design.md`

## Global Constraints

- Do not add a generic control plane, database, frontend framework, or ChatGPT-specific code.
- Default execution is read-only.
- Never print the bearer credential.
- Treat unavailable optional Hermes capabilities as reported capability gaps rather than fabricated support.
- Live external verification remains separate from unit tests and requires an actual Hermes endpoint.

---

### Task 1: Probe HTTP client and read-only checks

**Files:**
- Create: `tools/hermes_probe.py`
- Create: `tests/test_hermes_probe.py`

**Interfaces:**
- Produces: `HermesProbe(base_url: str, api_key: str, timeout: float = 10.0)`
- Produces: `HermesProbe.get_json(path: str) -> object`
- Produces: `HermesProbe.read_only_report() -> dict[str, object]`

- [ ] **Step 1: Write failing tests**

Use a local `ThreadingHTTPServer` fixture that implements `/v1/capabilities` and `/api/sessions`. Assert that `read_only_report()` returns both decoded payloads, sends `Authorization: Bearer <key>`, normalizes a trailing slash in the base URL, and never includes the key in the returned report.

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m unittest -v tests.test_hermes_probe`

Expected: import or symbol failure because `tools/hermes_probe.py` does not exist yet.

- [ ] **Step 3: Implement minimal client**

Implement `HermesProbe` with `urllib.request.Request`, JSON decoding, explicit timeout, base-URL normalization, and bearer auth. `read_only_report()` calls `/v1/capabilities` and `/api/sessions` and returns:

```python
{
    "base_url": "https://example.invalid",
    "capabilities": {...},
    "sessions": [...],
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `python -m unittest -v tests.test_hermes_probe`

Expected: all Task 1 tests pass.

---

### Task 2: Safe errors and opt-in chat

**Files:**
- Modify: `tools/hermes_probe.py`
- Modify: `tests/test_hermes_probe.py`

**Interfaces:**
- Produces: `HermesProbe.chat(message: str) -> object`
- Produces: `ProbeError` with sanitized diagnostics.
- Produces CLI: `python tools/hermes_probe.py --base-url URL [--api-key KEY] [--chat MESSAGE]`

- [ ] **Step 1: Write failing tests**

Extend the local server with `POST /v1/chat/completions`. Assert that `chat()` sends model `hermes-agent` and the user message. Add an auth-failure response whose body contains the supplied key and assert `ProbeError` string output replaces that credential with `[REDACTED]`. Add a CLI parser test proving chat is absent unless explicitly supplied.

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m unittest -v tests.test_hermes_probe`

Expected: failures for missing `chat`, `ProbeError`, and CLI parser behavior.

- [ ] **Step 3: Implement minimal behavior**

Add JSON POST support, sanitized `ProbeError`, `chat()`, `build_parser()`, and `main()`. Read the API key from `HERMES_API_KEY` when `--api-key` is omitted. Require a non-empty key. Print the read-only report as formatted JSON; only execute/print a chat response when `--chat` is provided.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `python -m unittest -v tests.test_hermes_probe`

Expected: all tests pass with no credential in output.

---

### Task 3: Operator documentation and final validation

**Files:**
- Create: `docs/implementation/hermes-api-probe.md`
- Modify: `STATE.md` only for repository-local verified facts; do not claim a live Hermes Cloud connection.

**Interfaces:**
- Documents environment variables `HERMES_BASE_URL` and `HERMES_API_KEY` and safe example commands with placeholders only.

- [ ] **Step 1: Document read-only use**

Document:

```bash
export HERMES_BASE_URL='https://your-hermes-host.example'
export HERMES_API_KEY='set-locally-never-commit'
python tools/hermes_probe.py --base-url "$HERMES_BASE_URL"
```

- [ ] **Step 2: Document explicit live-chat use**

Document:

```bash
python tools/hermes_probe.py \
  --base-url "$HERMES_BASE_URL" \
  --chat 'Reply with exactly: probe-ok'
```

State that this can incur inference/tool usage and is not part of the default read-only check.

- [ ] **Step 3: Validate repository-local behavior**

Run:

```bash
python -m unittest -v tests.test_hermes_probe
python tools/hermes_probe.py --help
```

Expected: tests pass and help lists `--base-url`, `--api-key`, and optional `--chat`.

- [ ] **Step 4: Review scope**

Confirm the diff contains no application framework, database, ChatGPT adapter, fake Hermes server outside tests, or committed secret values.