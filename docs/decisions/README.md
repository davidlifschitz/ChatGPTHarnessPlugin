# Architecture Decision Records

Use ADRs for decisions that change long-lived product boundaries, contracts, security posture, or deployment architecture.

Current decision history:

- `0001-shared-harness-control-plane.md` — superseded by ADR 0003.
- `0002-private-public-convergence.md` — partially superseded by ADR 0003; its shared-boundary principle remains useful.
- `0003-upstream-first-consumer-layer.md` — accepted for the upstream-first Hermes model; its ChatGPT-V2 sequencing is superseded by ADR 0006.
- `0004-multi-harness-upstream-first-connectors.md` — accepted for the multi-harness adapter model; its ChatGPT-future-channel sequencing is superseded by ADR 0006.
- `0005-operator-controlled-harness-runtime.md` — accepted for the Hermes runtime boundary when managed hosting does not expose the required machine API.
- `0006-chatgpt-plugin-primary-channel.md` — accepted; makes ChatGPT plugin/MCP the primary V1 consumer channel after DevDay 2026 platform changes.

New ADRs should describe context, decision, consequences, and status. Supersede old decisions explicitly rather than silently rewriting history.
