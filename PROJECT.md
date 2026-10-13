# ChatGPT Harness Plugin — Project Overview

## Product objective

Give users an agent capability inside ChatGPT, not infrastructure administration. A user should be able to delegate work, inspect progress, and continue a prior session without understanding harnesses, providers, MCP, containers, tunnels, API keys, or runtime processes. Starting/stopping work is a product goal, not a claim that every control is currently exposed.

ChatGPT is the primary V1 surface. Hermes is the MVP harness; OpenClaw is planned second. The standalone Vercel web surface is diagnostics/admin/testing unless a future ADR changes that role.

## Current milestone

M1 — Plus Personal Plugin Proof completed on 2026-10-01.

M2 — Hermes Plugin End-to-End is active and not green. The current acceptance target is the existing ChatGPT Harness Business custom MCP app, for the current user only, through the Vercel adapter to the existing managed Hermes Cloud agent Fair-dinkum Esky. The older private USER-scope plugin is not an interchangeable acceptance client.

The last recorded live blocker is server-side operator approval; request status, app usability, and live agent health have not been freshly verified on October 13. Exact-head GitHub CI/deployment status was rechecked; see [STATE.md](STATE.md) and [the refresh ledger](docs/implementation/m2-status-refresh-2026-10-13.md).

## Product and harness boundaries

The product owns focused MCP tools, authentication/authorization, user/runtime mapping, account linkage, safe errors/confirmation, and minimal routing/correlation state. Multi-user entitlements, onboarding, billing, analytics, and events are later work when justified.

Each harness owns execution, native sessions/history, memory, tools/skills, approvals, and model/provider routing. Do not mirror transcripts or build a generic runtime, model gateway, scheduler, or cross-harness state machine. Keep harness-specific transport behind the smallest useful adapter seam.

## Runtime strategy

Harness choice and hosting choice are separate. ADR 0007 selects native Hermes Cloud OAuth, short-lived WebSocket tickets, and JSON-RPC for M2. ADR 0005's operator-controlled runtime option remains a fallback; older Render/Railway work is not current acceptance evidence. The Portal lifecycle MCP interface must not be confused with task/session transport.

## Authentication and availability

M2 already implements a single-operator OAuth/PKCE boundary and private rotating upstream credentials. That does not prove unrelated-user isolation; M3 must establish user scoping and cross-user denial.

M1 empirically proved the user's Plus personal-plugin read/action path on October 1. It does not guarantee current Business-app connection, current plan-wide availability, mobile support, public approval, or Hermes use of Sign in with ChatGPT. Those are separate capabilities requiring their own evidence.

## Execution rules

- Reuse upstream harness capabilities before implementing replacements.
- Keep all credentials and private connector state server-side.
- Validate inputs and authorization independently of model behavior.
- Use a stable request ID per logical task and inspect uncertain outcomes before retrying.
- Destructive or hard-to-reverse operations require explicit confirmation.
- Unsupported or unverified capabilities fail explicitly.
- Update state only from observed behavior or clearly dated source evidence.
- Separate direct MCP evidence from actual ChatGPT client acceptance.
- Preserve historical evidence without presenting it as current live verification.
- Keep the existing app and agent; do not publish workspace-wide or create replacements for acceptance.
- Do not merge draft PR #8 or start M3 before the complete M2 gate passes.
- Long-lived architecture changes require an ADR; this reconciliation changes no runtime design.

## Source of truth

Use [STATE.md](STATE.md), [ROADMAP.md](ROADMAP.md), [ARCHITECTURE.md](ARCHITECTURE.md), and accepted [ADRs](docs/decisions/). The definitive M2 procedure is [manual acceptance](docs/implementation/m2-manual-acceptance.md). Historical upstream references and detailed investigation remain in the October 8/9 evidence ledger and Git history; they are not newly verified platform claims.
