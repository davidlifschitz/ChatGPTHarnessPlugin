# Architecture

```text
ChatGPT / MCP client
  -> private authenticated MCP endpoint (/mcp)
  -> Harness control plane
  -> HarnessRuntimeAdapter
       -> HermesRuntimeAdapter -> Hermes API server

LifecycleAdapter (separate boundary)
  -> local process/operator lifecycle or a future authenticated Nous Portal API
```

The core contract contains only runtime concepts: runtime identity, session identity, run identity, capabilities, state, result, and normalized errors. Hermes HTTP paths and wire shapes live under the Hermes adapter.

The private control plane exposes only the current stateless MCP Streamable HTTP request/response path. It authenticates each request with an injected bearer token, validates an exact Origin allowlist and per-request MCP metadata/header agreement, binds to loopback by default, applies request/response bounds, and projects sanitized DTOs. Runtime authentication is injected server-side and cannot be supplied as a tool argument. A product request does not remain open for the whole agent turn.

The adapter uses stable IDs and polling/event retrieval. Hermes-specific features are advertised from `/v1/capabilities`; an absent or false capability is surfaced as `UNSUPPORTED_CAPABILITY`. The private boundary currently exposes health, capabilities, start, status, and result retrieval; it does not proxy Hermes SSE or lifecycle mutation.

M1 does not claim that the product can provision, start, stop, restart, or destroy Hermes Cloud agents. Those are lifecycle concerns and remain separate from task/session execution until an official Nous Portal contract is verified.

The control plane is a local/private proof surface, not a public deployment. A real ChatGPT connection still requires an authorized developer-mode connection through Secure MCP Tunnel or an explicitly deployed private HTTPS proxy. The included Node entrypoint and listener refuse non-loopback binding; TLS termination belongs to the separately deployed proxy.
