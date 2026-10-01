# Implementation Plans

Detailed implementation plans live here and must map to a roadmap milestone.

Each plan should state:

- milestone and capability advanced;
- exact OpenAI plugin/MCP and upstream harness capability being consumed;
- the verified product gap, if custom code is proposed;
- files/components to change;
- acceptance criteria;
- validation commands and real end-to-end checks;
- security implications;
- temporary infrastructure/debt and its removal path;
- remaining blockers.

Plans are working artifacts. They do not override observed runtime behavior, authoritative upstream documentation, accepted ADRs, `ARCHITECTURE.md`, or `STATE.md`.

## Current implementation sequence

### M1

Implement and deploy the minimal streamable-HTTP `/mcp` endpoint and verify from ChatGPT developer mode on Plus:

- one read tool;
- one controlled write/action tool;
- useful errors;
- no secret exposure.

OpenAI references:

- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/build/mcp-server

### M2

Connect the same MCP service to the real Hermes API server and prove one tool-capable agent task.

Do not begin by scaffolding a generic control plane, public plugin polish, or OpenClaw abstraction.
