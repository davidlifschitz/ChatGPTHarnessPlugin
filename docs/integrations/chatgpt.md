# ChatGPT Integration

ChatGPT is a client of the shared Harness Control Plane.

## Target surfaces

- ChatGPT web
- ChatGPT mobile
- ChatGPT desktop
- Codex where compatible with the same plugin/app packaging and tools

## Contract

Expose a small, stable MCP/Apps SDK-compatible surface over the control plane. The client should request domain operations such as starting a task, checking status/result, continuing a session, approving an action, or cancelling work.

The model must not receive infrastructure credentials, external OAuth tokens, raw runtime secrets, or trusted tenant identifiers as tool arguments.

## Product rule

Do not make ChatGPT responsible for durable task/session state. Long-running work should return a stable server-side task identifier and be inspected through subsequent tool calls.

## Publication

Private developer testing and public app/plugin distribution are separate delivery channels over the same backend. Public submission requirements belong in `docs/product/release-requirements.md`.
