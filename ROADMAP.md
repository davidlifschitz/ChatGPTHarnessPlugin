# Roadmap

## M0 — architecture/documentation

The initial checkout contained only a product README. The M0 baseline is established by the M1 implementation and evidence documents in this branch.

## M1 — Hermes Runtime Adapter

Deliver a non-interactive product-side client that can resolve/connect to a configured Hermes runtime, submit a safe run, observe status/events, retrieve the result, and explicitly report unsupported capabilities. This is verified locally through the Hermes adapter and through the private MCP control-plane vertical slice.

## M1 private proof — partially verified

- Implemented an authenticated, stateless MCP Streamable HTTP endpoint at `/mcp` over the existing adapter.
- Verified the endpoint locally with real Hermes execution, stable runtime/session/run identifiers, status polling, and result retrieval.
- Remaining: connect the endpoint to ChatGPT developer mode through an authorized private tunnel or private HTTPS proxy and record a real ChatGPT tool invocation.

## Later

- Nous Portal lifecycle/discovery integration after its authenticated programmatic contract is confirmed.
- ChatGPT developer-mode/tunnel connection and public plugin packaging after private proof.
- Additional runtime adapters.
