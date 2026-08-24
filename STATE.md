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
- Unit tests, typecheck, and build pass on this branch.

## Verified not supported / not claimed

- Nous Portal agent lifecycle APIs (list/create/start/stop/destroy) are not claimed by the Hermes task adapter.
- TUI gateway JSON-RPC and ACP are not used by this M1 adapter.
- Product-side runtime provisioning is not implemented.
- `hermes serve` JSON-RPC/WebSocket is not claimed by the HTTP adapter.
- SSE replay/resume, durable run history after gateway restart, and hard cancellation are not claimed. Stop is cooperative and only exposed when advertised.

## Unverified / blocked

- Hermes Cloud lifecycle calls are documented by the official Nous Portal MCP surface but are not integrated into this repository.
- Hermes Cloud task execution, org/agent resolution through this product, and the required authenticated real Cloud E2E remain unverified.

## Next

- Open the focused PR with the local E2E evidence and explicit Cloud/lifecycle boundary.
