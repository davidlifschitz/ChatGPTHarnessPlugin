# Implementation

M1 is a small TypeScript vertical slice:

- `src/types.ts` and `src/errors.ts`: harness-neutral IDs, capabilities, states, results, errors, and adapter contract.
- `src/lifecycle.ts`: local configured-runtime resolution only; cloud lifecycle is intentionally separate.
- `src/client.ts`, `src/protocol.ts`, and `src/adapter.ts`: Hermes HTTP client, SSE parsing, capability mapping, and runtime adapter.
- `src/control-plane.ts` and `src/control-plane-main.ts`: authenticated private MCP Streamable HTTP boundary and environment-driven local entrypoint.
- `tests`: unit/protocol fixtures, control-plane boundary tests, and opt-in real-runtime tests.

## Private control plane

The control plane is intentionally small and stateless. It serves `POST /mcp` using MCP `2026-07-28`, validates the required per-request `_meta` protocol/client-capability fields plus `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`, JSON content type, and the required JSON/event-stream `Accept` header, and supports `server/discover`, `tools/list`, and `tools/call`. Discovery and tool-list results use `resultType: "complete"` with private, immediately-stale cache hints; header mismatches use MCP `-32020`, unsupported versions use `-32022`, and unknown methods return HTTP 404 with `-32601`.

The advertised tools are:

- `runtime_health`
- `runtime_capabilities`
- `start_run`
- `get_run`
- `get_result`

Each request must carry a deployment-injected bearer token and an exact allowed `Origin`. The default listener binds to `127.0.0.1`. Hermes runtime authentication is injected into the adapter and never accepted from tool arguments. Results omit Hermes `raw` payloads; upstream error messages/details are projected to stable safe error codes.

The control-plane boundary has a request deadline and bounded response/output projection. The deadline bounds the client response but does not claim to cancel an upstream Hermes operation; hard cancellation remains an explicit unsupported capability. The included Node entrypoint and listener only bind to loopback; remote access requires a separately deployed TLS-terminating private proxy or an authorized local tunnel. The Node entrypoint does not terminate TLS itself, and a proxy flag is not treated as TLS enforcement.

Run the local entrypoint with secret values supplied by the environment or deployment secret manager:

```text
HERMES_API_KEY=<runtime-only secret> \
CONTROL_PLANE_TOKEN=<private control-plane secret> \
CONTROL_PLANE_ORIGINS=http://127.0.0.1:4310 \
npm run control-plane
```

The opt-in private-path test uses the same boundary and a real local Hermes API server. It is intentionally separate from ordinary tests:

```text
HERMES_PRIVATE_E2E=1 \
HERMES_API_KEY=<runtime-only secret> \
CONTROL_PLANE_TOKEN=<private control-plane secret> \
npm run test:private-e2e
```

This proves a real MCP wire client to Hermes path, not a hosted ChatGPT connection. ChatGPT developer-mode testing still requires an authorized Secure MCP Tunnel or a separately deployed private HTTPS proxy. Public plugin publication is out of scope.

The real-runtime test must receive its endpoint/key through environment variables, targets only a loopback Hermes API server, and must use a harmless deterministic prompt. It must not print the key or treat a fixture as E2E evidence. Reusing a `session_id` alone is correlation only; explicit history/response chaining is required for continuation.

Expected local checks are:

```text
npm test
npm run typecheck
npm run build
npm run test:e2e # only with HERMES_M1_E2E=1 and runtime-only credentials
npm run test:private-e2e # only with HERMES_PRIVATE_E2E=1 and runtime/control-plane credentials
```

The M1 E2E test uses `Reply with exactly: HERMES_M1_OK`, polls by stable run ID, and asserts the exact terminal output. It is skipped by default so ordinary tests never require credentials or a running Hermes gateway.
