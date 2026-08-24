# ChatGPTHarnessPlugin — Project Overview

This repository is the canonical source of truth for the ChatGPT Harness Plugins product.

## End goal

Build a cloud-hosted, function-agnostic control plane that lets people invoke powerful agent harnesses directly from ChatGPT on web, mobile, and desktop/Codex without needing to understand MCP, tunnels, VPS hosting, agent processes, or harness-specific infrastructure.

The platform should support agents that code, research, market, perform SEO, operate browser workflows, handle productivity tasks, or do other general-purpose work.

## Product model

ChatGPT is a client, not the control plane.

The shared control plane owns:

- identity and tenant resolution,
- harness/runtime registry and routing,
- durable task and session state,
- authorization, policy, and approvals,
- credentials and secret boundaries,
- audit and usage metadata,
- reliability and retries,
- shared public/private contracts.

Each harness is integrated behind a runtime adapter.

## First runtime

Hermes is the first implementation target because it already provides a general-purpose agent harness and Nous-hosted infrastructure. It is not the product boundary.

Future adapters may include OpenClaw, Pi, and other harnesses when doing so adds real user value.

## Two delivery paths

### Private/canary

Used for owner dogfooding, protocol validation, staging, failure testing, and early end-to-end control.

Temporary infrastructure is acceptable only when it sits behind production-shaped interfaces.

### Published/stable

The user-facing ChatGPT app/plugin with production authentication, tenant isolation, reliability, safety, and publication requirements.

### Convergence rule

Private and published paths must converge on the same backend, domain model, adapters, task/session engine, policy layer, and tests before public release.

## Current milestone

**M1 — Hermes Runtime Adapter**

M1 is not complete. The immediate technical objective is to verify Hermes' actual remote-control/session capabilities and implement the first shared runtime adapter without depending on unverified internal APIs.

See [`STATE.md`](STATE.md) for verified current status.

## Next priorities

1. Verify the real Hermes remote execution/session protocol and Nous Portal lifecycle capabilities.
2. Implement the shared runtime-adapter contract plus Hermes adapter.
3. Prove a programmatic end-to-end run: select/start runtime → submit task → observe state/result → continue/cancel/stop where supported.

## Hard development rules

1. One shared core; clients and harness adapters stay thin.
2. Every substantial change maps to a roadmap milestone.
3. Do not create private-only business logic that must later be rewritten for publication.
4. Do not couple ChatGPT-facing code directly to Hermes/OpenClaw/Pi internal classes or file layouts.
5. Long-running task/session state lives server-side.
6. Credentials never transit model context or enter source control.
7. Unsupported runtime capabilities fail explicitly; never fabricate support.
8. A feature is complete only when its relevant observable/end-to-end behavior is verified.
9. Update `STATE.md` whenever verified project reality materially changes.
10. Long-lived architecture changes require an ADR under `docs/decisions/`.

## Canonical documents

Read in this order:

1. `PROJECT.md` — product goal and development invariants.
2. `STATE.md` — verified reality today.
3. `ROADMAP.md` — sequencing and milestone gates.
4. `ARCHITECTURE.md` — long-lived system boundaries.
5. `docs/decisions/` — accepted architecture decisions.
6. `docs/integrations/`, `docs/product/`, and `docs/implementation/` — detailed working material.

When documents disagree, verified code/runtime behavior and `STATE.md` take precedence over older plans and conversation history.
