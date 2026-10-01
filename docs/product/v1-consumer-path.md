# V1 Consumer Path

## User promise

A normal user can stay inside ChatGPT, delegate work to an agent harness, return to existing work, inspect progress/results, and stop work when supported without seeing or managing terminals, API keys, MCP configuration, cloud-instance details, model-provider setup, or other infrastructure.

## First experiment

The first V1 experiment is a **personal ChatGPT plugin on Plus**, not a custom consumer frontend.

The sequence is:

1. deploy a minimal streamable-HTTP MCP endpoint at a stable HTTPS `/mcp` URL;
2. connect it from ChatGPT developer mode;
3. prove one harmless read tool;
4. prove one controlled write/action tool;
5. connect the same MCP service to a real Hermes API server;
6. prove one real tool-capable Hermes task.

OpenAI references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/build/mcp-server

## Consumer UX requirements

The ordinary-user plugin surface should initially expose only what is needed to use an agent:

- start/select work;
- send or continue work;
- current status and recent output;
- recoverable errors;
- stop/cancel when supported;
- authentication/account linkage when public multi-user access begins.

Administrative Hermes configuration should not be part of the normal user flow.

## Tool design

The plugin should expose goal-level tools rather than mirror every Hermes endpoint.

Reference:

- https://developers.openai.com/plugins/plan/tools

Exact tool names are not fixed by this document. They should be derived from the real Hermes integration and remain small enough to understand and secure.

## Existing Vercel surface

The repository's standalone Vercel page and REST routes remain useful for:

- direct Hermes diagnostics;
- adapter testing;
- admin/operations;
- separating ChatGPT-specific failures from backend failures.

They are no longer the V1 consumer promise.

## Questions M1/M2 must answer with evidence

1. Can the user's Plus account connect to our deployed `/mcp` endpoint and invoke read/write tools?
2. What secure machine path will the MCP service use to reach the real Hermes API server?
3. Which small set of plugin tools maps cleanly to Hermes sessions/runs?
4. How should unrelated end users be isolated: Hermes profiles, dedicated runtimes, stable session keys, or another supported boundary?
5. What product-owned state is genuinely necessary after the above works?
6. Does the intended ChatGPT mobile surface expose the published plugin as required for the product promise?

## Exit artifact

M1 ends with a real Plus -> MCP proof.

M2 ends with a real ChatGPT -> MCP -> Hermes task plus a gap ledger. M3 scope is generated from that evidence rather than predetermined.
