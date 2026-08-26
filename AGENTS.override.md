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

- Every substantial change must map to a roadmap milestone.
- The product is harness-neutral; **Hermes is the MVP harness and OpenClaw is the planned second harness**.
- Verify whether the selected harness already provides a capability before designing or implementing a replacement.
- Prefer supported upstream APIs/lifecycle surfaces over custom runtime state machines.
- Add custom backend/state only for a documented consumer-product gap or truly shared product concern.
- Keep harness-specific authentication, endpoints, transport, lifecycle access, capability handling, and diagnostics behind the smallest practical connector seam.
- Do not recreate harness sessions, runs, approvals, memory, skills, tools, model routing, or equivalent native runtime state by default.
- Do not build a generic multi-harness control plane. Generalize the connector seam only from evidence produced by real harness implementations.
- Do not delay the Hermes MVP to pre-build OpenClaw abstractions.
- After the Hermes production web MVP, OpenClaw is the next planned harness and should be used to validate/revise the connector boundary.
- Keep harness/provider credentials server-side and out of browser code, prompts, logs, issues, PRs, and source control.
- Unsupported or unverified capabilities fail explicitly; never fabricate working behavior.
- Update `STATE.md` only with verified reality.
- Add an ADR when a long-lived architecture decision changes.
- Record milestone, harness/surface, acceptance criteria, temporary debt, and production replacement path in issues/PRs.
- Vercel deployments may be used for manual browser/phone testing, but never expose upstream harness secrets in client bundles.
- ChatGPT plugin/Apps SDK/MCP work is V2+ and must not shape V1 domain architecture.

## Current critical path

The current milestone is **M1 — Hermes Thin Consumer Path**. Prove the simplest real deployed browser experience over the existing Hermes API server and Hermes Cloud, including manual desktop/phone testing, before authorizing bespoke platform infrastructure.
