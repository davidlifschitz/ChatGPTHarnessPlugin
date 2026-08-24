# State

## Verified working

- Product branch `m1/hermes-runtime-adapter` exists from the clean initial commit.
- The current official Hermes source and documentation expose the `hermes gateway` HTTP runs API:
  `POST /v1/runs`, `GET /v1/runs/{run_id}`, `GET /v1/runs/{run_id}/events`,
  `POST /v1/runs/{run_id}/stop`, `POST /v1/runs/{run_id}/approval`, and
  `GET /v1/capabilities`.
- Local Hermes Agent v0.20.5 is installed and Nous Portal auth is already present in the local runtime. No credential values are stored here.
- The adapter implements stable `runtimeId`, `sessionId`, and `runId` handles, capability discovery, polling/result retrieval, SSE parsing, explicit unsupported-capability errors, and a separate configured-runtime resolver.
- A disposable cloned Hermes profile ran the real prompt `Reply with exactly: HERMES_M1_OK` through the adapter and returned `HERMES_M1_OK` with a completed run. The temporary profile was deleted; existing supervised gateways remained running and unchanged.
- A private control plane now exposes current stateless MCP Streamable HTTP at `/mcp` with per-request bearer authentication, exact Origin allowlisting, loopback-default listening, required MCP metadata/header validation, server discovery, tools/list, and sanitized tools for runtime health/capabilities, start, status, and result retrieval. Hermes auth is injected server-side.
- The opt-in private-path test exercised MCP `tools/call` through the control plane into a disposable real Hermes API server with the harmless prompt `Reply with exactly: HERMES_PRIVATE_MCP_OK`; it returned the exact result `HERMES_PRIVATE_MCP_OK` with a completed state and correlated run ID. The disposable profile and API server were removed afterward; existing supervised gateways remained unchanged.
- Unit tests (34 total: 32 pass, 2 intentionally skipped), typecheck, build, package dry-run, and focused security checks pass on this branch. Ordinary tests do not require credentials or a running runtime.

## Verified not supported / not claimed

- Nous Portal agent lifecycle APIs (list/create/start/stop/destroy) are not claimed by the Hermes task adapter.
- TUI gateway JSON-RPC and ACP are not used by this M1 adapter.
- Product-side runtime provisioning is not implemented.
- `hermes serve` JSON-RPC/WebSocket is not claimed by the HTTP adapter.
- SSE replay/resume, durable run history after gateway restart, and hard cancellation are not claimed. Stop is cooperative and only exposed when advertised.
- The private control plane does not expose raw Hermes payloads, event streams, process lifecycle, approval mutation, continuation, or arbitrary model/provider options. Its response deadline and output bounds protect the boundary; a deadline does not cancel an upstream Hermes operation.
- OAuth discovery, multi-principal authorization, opaque expiring operation handles, and idempotent duplicate-submit protection are not implemented; the current private proof assumes one operator-configured bearer principal and a pre-provisioned runtime.

## Unverified / blocked

- Hermes Cloud lifecycle calls are documented by the official Nous Portal MCP surface but are not integrated into this repository.
- Hermes Cloud task execution, org/agent resolution through this product, and the required authenticated real Cloud E2E remain unverified.
- A real ChatGPT client connection is not yet verified. The local `/mcp` endpoint is not reachable from hosted ChatGPT without an authorized Secure MCP Tunnel or private HTTPS deployment/connector configuration.

## Next

- Connect the local/private `/mcp` endpoint through the official ChatGPT developer-mode private tunnel, then record a real ChatGPT tool discovery and harmless task/result exchange.
