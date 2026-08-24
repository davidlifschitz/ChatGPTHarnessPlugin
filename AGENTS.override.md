# ChatGPTHarnessPlugin — Project Instructions

Before substantive product work, read in order:

1. `PROJECT.md`
2. `STATE.md`
3. the relevant milestone in `ROADMAP.md`
4. `ARCHITECTURE.md`
5. relevant ADRs under `docs/decisions/`
6. relevant integration/product/implementation docs under `docs/`

Treat this repository as authoritative over conversation history or memory.

## Development rules

- Every substantial change must map to a roadmap milestone.
- Prefer shared-core changes over client-specific or harness-specific business logic.
- Keep ChatGPT as a client; durable task/session/auth/policy state belongs server-side.
- Keep each harness behind an adapter boundary.
- Hermes is the first adapter, not the product architecture.
- Verify actual upstream capabilities before implementing against a plan assumption.
- Unsupported capabilities fail explicitly; never fabricate working behavior.
- Never commit or expose passwords, OAuth codes/tokens, API keys, private keys, cookies, session tokens, or other secrets.
- Update `STATE.md` only with verified reality.
- Add an ADR when a long-lived architecture decision changes.
- Record milestone, surface, acceptance criteria, temporary debt, and production replacement path in issues/PRs.

## Current critical path

The current milestone is **M1 — Hermes Runtime Adapter**. Verify the real Hermes remote-control/session interface and implement the shared runtime-adapter/control-plane foundation before expanding product UX or adding additional harnesses.
