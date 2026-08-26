# Hermes Consumer Layer — Project Instructions

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
- Verify whether Hermes/Nous already provides a capability before designing or implementing a replacement.
- Prefer supported Hermes APIs and Portal/Cloud lifecycle surfaces over custom state machines or adapters.
- Add custom backend/state only for a documented consumer-product gap.
- Do not recreate Hermes sessions, runs, approvals, memory, skills, tools, or model routing by default.
- Do not build a generic multi-harness abstraction in V1.
- Keep Hermes/Portal credentials server-side and out of browser code, prompts, logs, issues, PRs, and source control.
- Unsupported or unverified capabilities fail explicitly; never fabricate working behavior.
- Update `STATE.md` only with verified reality.
- Add an ADR when a long-lived architecture decision changes.
- Record milestone, surface, acceptance criteria, temporary debt, and production replacement path in issues/PRs.
- ChatGPT plugin/Apps SDK/MCP work is V2+ and must not shape V1 domain architecture.

## Current critical path

The current milestone is **M1 — Thin Consumer Path**. Prove the simplest real browser experience over the existing Hermes API server and Hermes Cloud before authorizing bespoke platform infrastructure.