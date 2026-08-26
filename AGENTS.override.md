# Harness Consumer Layer — Project Instructions

Before substantive product work, read in order:

1. `PROJECT.md`
2. `STATE.md`
3. the relevant milestone in `ROADMAP.md`
4. `ARCHITECTURE.md`
5. relevant ADRs under `docs/decisions/`
6. relevant integration/product/implementation docs under `docs/`

Treat this repository plus verified current upstream behavior as authoritative over older conversation history.

## Development rules

- Every substantial change maps to a roadmap milestone.
- The product is harness-neutral; **Hermes is the MVP harness and OpenClaw is the planned second harness**.
- Separate harness software from hosting provider. Do not assume managed harness hosting is the architecture.
- Verify whether the selected harness already provides a capability before implementing a replacement.
- Prefer upstream harness APIs and semantics over custom runtime state machines.
- It is acceptable to operate the harness on product-controlled VM/container infrastructure when required for secure machine access.
- Product-operated infrastructure must stay minimal and invisible to the user; do not turn it into a generic agent platform prematurely.
- Add custom backend/state only for documented consumer gaps or shared product concerns.
- Keep harness-specific auth/endpoints/transport/capability handling behind the smallest practical connector seam.
- Do not recreate harness sessions, runs, approvals, memory, skills, tools, model routing, or equivalent native runtime state by default.
- Do not build a generic multi-harness control plane. Generalize only from real Hermes/OpenClaw evidence.
- Do not delay Hermes to pre-build OpenClaw abstractions.
- After the Hermes production web MVP, OpenClaw is next and should validate/revise the connector boundary.
- Keep harness/provider credentials server-side and out of browser code, prompts, logs, issues, PRs, and source control.
- Unsupported/unverified capabilities fail explicitly.
- Update `STATE.md` only with verified reality.
- Add an ADR when a long-lived architecture decision changes.
- Vercel may host the consumer surface; upstream harness secrets must never enter client bundles.
- ChatGPT plugin/Apps SDK/MCP is V2+ and must not shape V1 domain architecture.

## Current critical path

The current milestone is **M1 — Hermes Controlled-Runtime End-to-End**. Deploy one persistent official Hermes runtime on infrastructure controlled by the product operator, connect the protected Vercel test client to it securely, and prove a real phone/desktop user journey before authorizing broader platform automation.
