# Hermes Integration

Hermes is the upstream agent system for the first harness implementation. It remains authoritative for execution and native state regardless of who hosts its process.

## Verified supported surfaces

Current official Hermes documentation provides an authenticated HTTP API server with:

- OpenAI-compatible chat completions and streaming;
- Responses API;
- asynchronous runs/control/events;
- `/v1/capabilities`;
- `/v1/models`;
- REST session management/history/chat/streaming;
- skills/toolset discovery;
- stable `X-Hermes-Session-Key` memory scoping.

Consumers should discover the advertised API model instead of assuming a fixed model ID.

## Product boundary

Hermes owns agent execution/tool loops, run/session semantics, message history, approvals/control, skills/toolsets/MCP execution, memory, and provider/model integration.

Our product does not duplicate these systems by default.

The ChatGPT-facing MCP service translates a small set of user outcomes into supported Hermes operations while keeping Hermes credentials and transport details server-side.

## M2 integration strategy

1. Start from the working ChatGPT personal-plugin MCP boundary produced in M1.
2. Select a secure machine-accessible Hermes API origin.
3. If managed Hermes Cloud still lacks a supported session/chat ingress, run official Hermes on persistent operator-controlled infrastructure under ADR 0005.
4. Configure provider/model/tool access through supported Hermes setup, including Nous Portal or Sign in with ChatGPT where verified and useful.
5. Enable the Hermes API server with a server-side bearer key.
6. Place the API behind restricted machine ingress; do not expose the raw agent port broadly.
7. Probe `/v1/capabilities`, `/v1/models`, and `/api/sessions` before model execution.
8. Map the minimal plugin tool outcomes to Hermes-native sessions/runs.
9. Preserve Hermes session/run identifiers and semantics.
10. Add product mediation only for authentication, authorization, account/runtime mapping, safe tool behavior, or other observed gaps.

## Network and deployment constraints

Official Hermes configuration documents:

- `API_SERVER_ENABLED=false` by default;
- `API_SERVER_HOST=127.0.0.1` by default;
- `API_SERVER_PORT=8642` by default;
- `API_SERVER_KEY` required whenever the API server is enabled.

Opening the API port on an Internet-facing machine is security-sensitive because Hermes can exercise powerful tools. The MCP service should reach Hermes over a restricted/private or access-controlled machine path in addition to Hermes bearer auth.

## Managed Hermes Cloud finding

The public managed-Cloud dashboard hostname tested in August 2026 was not a usable `API_SERVER_KEY`-only machine origin under the observed contract because a human-facing Nous OAuth gate processed the Authorization header first.

That result is historical evidence about the tested ingress path. It is not proof that every current/future Hermes Cloud ingress is unavailable.

The documented Portal MCP surface manages cloud lifecycle; it does not itself document the Hermes session/chat transport required for M2.

## Security

`API_SERVER_KEY`, Portal tokens, provider credentials, ingress credentials, and user OAuth secrets remain server-side. ChatGPT receives only the MCP tool contract and permitted results.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt
