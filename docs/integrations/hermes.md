# Hermes Integration

Hermes is the upstream agent system for V1, not an interchangeable runtime hidden behind a generic adapter.

## Verified supported surfaces

Current official Hermes documentation provides three programmatic protocols. For the consumer web product, the primary surface is the HTTP API server.

The API server currently documents:

- `POST /v1/chat/completions` with SSE streaming;
- `POST /v1/responses`;
- asynchronous run start/status/events;
- approval, steering, and stop controls;
- `GET /v1/capabilities` for feature detection;
- `GET /v1/models` for OpenAI-compatible model discovery;
- session list/create/read/update/delete/history/fork/chat/stream operations;
- skills and toolset discovery;
- `X-Hermes-Session-Key` for stable multi-user/channel memory scoping.

`/v1/models` advertises the API-server model name. Official documentation states that this defaults to the active profile name, or `hermes-agent` for the default profile, so consumers should discover it rather than assume a fixed model ID.

Hermes also explicitly documents compatibility with OpenAI-compatible frontends such as Open WebUI, LobeChat, LibreChat, NextChat, and ChatBox.

## Product boundary

Hermes owns:

- agent execution and tool loops;
- run/session semantics;
- session message history;
- approvals/steering/stop behavior exposed by its API;
- skills/toolsets and MCP execution;
- agent memory mechanisms;
- provider/model/tool-gateway integration.

Our product should not duplicate these systems by default.

## V1 integration strategy

1. Use a real Hermes API server as the backend.
2. Probe `/v1/capabilities` rather than hardcoding assumed features.
3. Discover the exposed model ID from `/v1/models`.
4. Begin with an existing OpenAI-compatible frontend if it satisfies the required interaction model.
5. Preserve Hermes session/run identifiers and semantics.
6. Add server-side mediation only where required for credentials, authorization, consumer account mapping, or missing product UX.

## Network and deployment constraint

Official Hermes configuration currently defaults to:

- `API_SERVER_ENABLED=false`;
- `API_SERVER_HOST=127.0.0.1`;
- `API_SERVER_PORT=8642`;
- `API_SERVER_KEY` required whenever the API server is enabled.

For network access, Hermes documentation shows explicitly enabling the API server and binding it to a reachable interface such as `0.0.0.0`, together with a bearer key and an appropriate ingress/port/reverse-proxy configuration. Exposing this surface is security-sensitive because the API can drive the agent's full toolset, including terminal operations.

Most documented web frontends can use a server-to-server OpenAI-compatible connection, so V1 should prefer that pattern over exposing `API_SERVER_KEY` to browser JavaScript.

## Security

`API_SERVER_KEY`, Portal tokens, provider credentials, and other secrets must remain server-side. If a browser frontend cannot keep the API key secret, it must connect through a trusted server-side proxy/session rather than receive the upstream credential.

## Open question for M1

The exact externally reachable URL/auth/network configuration of the existing Hermes Cloud instance still needs live verification. Current official self-hosted/API-server documentation proves how Hermes can be exposed; it does not prove that the user's current Hermes Cloud instance automatically publishes port 8642 or an equivalent API URL.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/user-guide/docker
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard
