# Hermes Integration

Hermes is the upstream agent system for V1. It remains authoritative for execution and native state regardless of who hosts its process.

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

## M1 integration strategy

1. Run an official Hermes runtime on a persistent operator-controlled cloud host.
2. Persist Hermes-native data using the supported host volume/state layout.
3. Configure provider/model/tool access through supported Hermes setup, including Nous Portal where useful.
4. Enable the Hermes API server with a server-side bearer key.
5. Place the API behind restricted machine ingress; do not expose the raw agent port broadly.
6. Probe `/v1/capabilities`, `/v1/models`, and `/api/sessions` before model execution.
7. Preserve Hermes session/run identifiers and semantics.
8. Add product mediation only for credentials, authorization, account mapping, UX, or other observed gaps.

## Network and deployment constraints

Official Hermes configuration documents:

- `API_SERVER_ENABLED=false` by default;
- `API_SERVER_HOST=127.0.0.1` by default;
- `API_SERVER_PORT=8642` by default;
- `API_SERVER_KEY` required whenever the API server is enabled.

Official Docker guidance shows deliberate network binding and persistent host data. Opening the API port on an Internet-facing machine is security-sensitive because Hermes can exercise powerful tools, so M1 should use a restricted/private or access-controlled HTTPS path in addition to Hermes bearer auth.

## Managed Hermes Cloud finding

The previously tested public managed-Cloud dashboard hostname is not a usable `API_SERVER_KEY`-only machine origin under the observed contract because a human-facing Nous OAuth gate processes the Authorization header first.

That result is historical evidence about one hosting product. It is not a limitation of the Hermes API server itself and no longer blocks M1.

## Security

`API_SERVER_KEY`, Portal tokens, provider credentials, and ingress credentials remain server-side. Browser JavaScript never receives upstream secrets.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
