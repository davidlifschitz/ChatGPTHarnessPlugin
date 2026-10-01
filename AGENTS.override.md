# ChatGPT Harness Plugin — Project Instructions

Before substantive product work, read in order:

1. `PROJECT.md`
2. `STATE.md`
3. the relevant milestone in `ROADMAP.md`
4. `ARCHITECTURE.md`
5. relevant ADRs under `docs/decisions/`
6. relevant integration/product/implementation docs under `docs/`

Treat this repository plus verified current upstream OpenAI/harness behavior as authoritative over older conversation history.

## Development rules

- Every substantial change maps to a roadmap milestone.
- **ChatGPT is the primary V1 user surface.**
- Start with the Plus personal-plugin path before public directory work.
- The product is harness-neutral; **Hermes is the MVP harness and OpenClaw is the planned second harness**.
- Separate harness software from hosting provider.
- Verify whether ChatGPT or the selected harness already provides a capability before implementing a replacement.
- Prefer upstream harness APIs and semantics over custom runtime state machines.
- It is acceptable to operate the harness on product-controlled VM/container infrastructure when required for secure machine access.
- Product-operated infrastructure must stay minimal and invisible to the user.
- Keep the public MCP service focused on product-owned concerns: auth, authorization, user/runtime mapping, safe goal-level tools, and adapter transport.
- Keep harness-specific auth/endpoints/transport/capability handling behind the smallest practical adapter seam.
- Do not recreate harness sessions, runs, approvals, memory, skills, tools, model routing, or equivalent native runtime state by default.
- Do not build a generic multi-harness control plane.
- Do not delay Hermes to pre-build OpenClaw abstractions.
- After the Hermes plugin path is stable, OpenClaw is next and should validate/revise the adapter boundary.
- Keep harness/provider credentials server-side and out of plugin packages, browser code, prompts, logs, issues, PRs, and source control.
- Use MCP OAuth 2.1 for authenticated public user access.
- Validate tool inputs and authorization server-side; never rely on the model to enforce access.
- Destructive/hard-to-reverse actions require explicit tool semantics and confirmation behavior.
- Unsupported/unverified capabilities fail explicitly.
- Update `STATE.md` only with verified reality.
- Add an ADR when a long-lived architecture decision changes.
- The existing Vercel web UI is diagnostics/admin/testing unless a later ADR promotes it to a primary consumer channel.
- Do not begin plugin-directory polish before the private Plus -> MCP -> Hermes path works.

## Current critical path

The current milestone is **M1 — Plus Personal Plugin Proof**.

Implement and deploy one minimal streamable-HTTP MCP endpoint, connect it from ChatGPT developer mode on Plus, and prove one read tool plus one controlled write/action tool.

Then proceed directly to **M2 — Hermes Plugin End-to-End** and prove a real Hermes task through that same MCP boundary.
