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
- session list/create/read/update/delete/history/fork/chat/stream operations;
- skills and toolset discovery;
- `X-Hermes-Session-Key` for stable multi-user/channel memory scoping.

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
3. Begin with an existing OpenAI-compatible frontend if it satisfies the required interaction model.
4. Preserve Hermes session/run identifiers and semantics.
5. Add server-side mediation only where required for credentials, authorization, consumer account mapping, or missing product UX.

## Security

`API_SERVER_KEY`, Portal tokens, provider credentials, and other secrets must remain server-side. If a browser frontend cannot keep the API key secret, it must connect through a trusted server-side proxy/session rather than receive the upstream credential.

## Open question for M1

The exact externally reachable URL/auth/network configuration of the existing Hermes Cloud instance still needs live verification. Documentation proves the API exists; it does not by itself prove how the user's current Cloud instance exposes it publicly.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard
