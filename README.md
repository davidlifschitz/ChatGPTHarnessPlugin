# ChatGPTHarnessPlugin

A product-side runtime adapter boundary for connecting ChatGPT to agent runtimes.

M1 implements a harness-neutral TypeScript contract and Hermes `hermes gateway` HTTP adapter. It supports capability discovery, safe run submission, polling, result retrieval, optional SSE observation, and explicit unsupported-capability errors. Nous Portal lifecycle and Hermes Cloud execution remain separate, documented follow-up work.

```text
npm install
npm test
npm run typecheck
npm run build
```

See [M1 implementation notes](docs/implementation/README.md), [Hermes integration evidence](docs/integrations/hermes.md), and [current state](STATE.md).

## Private MCP proof

The repository also contains a small authenticated MCP Streamable HTTP control plane at `/mcp`. It binds to loopback by default, validates an exact Origin allowlist and bearer token, and exposes only runtime health/capabilities, run submission, status, and result retrieval. Hermes API credentials stay server-side and raw Hermes payloads are not returned.

Use deployment secret storage for `HERMES_API_KEY` and `CONTROL_PLANE_TOKEN`, set `CONTROL_PLANE_ORIGINS`, then run `npm run control-plane`. The opt-in `npm run test:private-e2e` test exercises the same MCP boundary against a real local Hermes runtime with a harmless deterministic prompt. This is private local proof; ChatGPT developer-mode connection through an authorized private tunnel remains a separate unverified step.
