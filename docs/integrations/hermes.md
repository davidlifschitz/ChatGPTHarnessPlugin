# Hermes integration

## Verified transport

M1 targets the current Hermes API server over HTTP. The current official docs and source identify:

- `hermes gateway` as the API-server host path; `hermes serve` is the headless desktop/dashboard JSON-RPC/WebSocket backend and is a distinct transport.
- `POST /v1/runs` with an `input` string (and optional session/continuation fields) to receive HTTP 202 and `{ "run_id": "...", "status": "started" }`.
- `GET /v1/runs/{run_id}` to poll a run. Verified normalized states are `queued`, `started`, `running`, `waiting_for_approval`, `stopping`, `completed`, `failed`, and `cancelled`; a terminal example is an object with `run_id`, `status`, `session_id`, `model`, `output`, and optional usage.
- `GET /v1/runs/{run_id}/events` as an SSE stream of lifecycle/progress events. Current source emits JSON in `data` frames with an embedded `event` name; the adapter also accepts standard SSE `event`/`id` fields.
- `POST /v1/runs/{run_id}/stop` with `{}` to request cooperative interruption; the verified response is a run control object containing `run_id` and `status: "stopping"`, before settling to `cancelled`.
- `POST /v1/runs/{run_id}/approval` with `{ "choice": "once"|"session"|"always"|"deny", "all"?: boolean }` for a pending approval when the capability is advertised; the verified response contains `run_id`, `choice`, and `resolved`.
- `GET /v1/capabilities` for live feature flags, including run submission/status/events/stop and optional approval/session features.
- `GET /health` for liveness and authenticated `GET /health/detailed` for bounded readiness.

The old audit assumption that `/v1/runs` was absent is retired for `hermes gateway`: current official source/docs and a real local run verify it. It remains inapplicable to `hermes serve`, which is a separate JSON-RPC/WebSocket backend. The adapter checks capabilities at runtime rather than assuming every optional endpoint exists on every version.

The adapter treats polling as the recovery truth. Current evidence does not verify SSE replay with `Last-Event-ID`, durable event history after disconnect, or a reconnect/resume contract. An SSE consumer must observe a terminal run event; otherwise the adapter returns a protocol error.

## Authentication

Hermes API-server requests use `Authorization: Bearer <API_SERVER_KEY>`. The key is injected at runtime into the adapter and is never serialized into domain results, errors, fixtures, logs, or docs. Loopback/local use is preferred for M1 validation. Public/non-loopback Hermes dashboard auth and Nous OAuth are separate concerns.

## Sessions and continuation

The runs API accepts an optional `session_id`, `instructions`, `conversation_history`, or `previous_response_id`. In the current source, a run `session_id` is a correlation/session identity; reusing it alone does not reload a prior transcript. M1 preserves that ID but only permits `continueSession` when the caller supplies explicit `conversation_history` or `previous_response_id`. Durable `/api/sessions/*` and `/v1/responses` continuation remain separate surfaces.

## Other Hermes protocols

Hermes also documents ACP and TUI gateway JSON-RPC/WebSocket. They expose richer interactive features, but M1 does not depend on arbitrary internal classes or an undocumented websocket framing contract.

## Evidence

- [Programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md)
- [API server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)
- [CLI commands](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md)
- [API server source](https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py)

## Product-side private boundary

The product-side private MCP control plane is a separate HTTP boundary over this adapter. It does not expose Hermes endpoints directly to the model client and does not forward Hermes raw payloads. The boundary injects the Hermes `API_SERVER_KEY` server-side, requires a private bearer token and exact Origin allowlist, and returns only normalized runtime/session/run identifiers, state, result, and safe error codes.

The first verified private path is local: MCP Streamable HTTP `/mcp` → control plane → configured Hermes API server. Hosted ChatGPT connectivity is not claimed until an authorized developer-mode private tunnel or private HTTPS proxy has been exercised.

## Capability evidence

Verified: local API-server connection, capability discovery, run submission, run polling, terminal result retrieval, stable runtime/run/session IDs, and the cooperative stop/approval request shapes behind advertised feature flags.

Unsupported/not claimed: `hermes serve` control through this HTTP adapter, runtime process provisioning/stop through the HTTP adapter, and hard cancellation.

Unknown/unverified: SSE replay/resume, durable run history after gateway restart, the exact Cloud task-execution transport behind Portal lifecycle MCP, and product-side Cloud org/agent resolution.
