# Harness Consumer Layer

A thin, consumer-facing product layer over capable general-purpose agent harnesses.

**Hermes is the first MVP harness, not the product identity.** It is first because Nous Research already provides hosted Hermes infrastructure and supported APIs that make it the fastest path to a real consumer MVP. **OpenClaw is the planned second harness.**

## Goal

Let normal people use powerful general-purpose agents from a phone or browser without understanding terminals, MCP, API keys, model providers, VPSs, tunnels, or harness administration.

The product should reuse each harness's supported runtime, sessions, memory, tools, and lifecycle capabilities rather than rebuilding them into a new agent platform.

## System shape

```text
User
  |
  v
Simple consumer web experience
  |
  v
Minimal product/account boundary
  |
  v
Harness connector seam
  |                 |
  v                 v
Hermes             OpenClaw
MVP                 next
  |
  v
Nous Portal / Hermes Cloud where applicable
```

The connector seam is intentionally thin. It isolates harness-specific authentication, endpoints, capability discovery, request/stream transport, lifecycle access, and error translation. It does **not** introduce a generic task engine, session database, memory layer, or orchestration platform.

## MVP: Hermes

Hermes is the implementation target for the first usable and deployable web product. For Hermes, we reuse:

- Hermes API server chat/run/session/capability surfaces;
- streaming agent events and control endpoints;
- Hermes memory/session behavior;
- Nous Portal and Hermes Cloud hosting/lifecycle capabilities.

The immediate milestone is still to prove the thinnest real browser path against a real Hermes instance before adding custom infrastructure.

## Second harness: OpenClaw

OpenClaw is the planned second harness after the Hermes web MVP works. Its purpose is both product expansion and an architectural test: implementing OpenClaw should validate which parts of the connector seam are genuinely reusable.

We do not delay Hermes to pre-generalize for OpenClaw, and we do not force OpenClaw into fake Hermes semantics later.

## Product-owned concerns

Only consumer-specific concerns belong here, such as:

- onboarding and sign-in;
- user-to-harness/agent connection mapping;
- harness selection;
- secret mediation;
- simplified permissions and entitlements;
- consumer UX;
- billing/product analytics when needed;
- future distribution channels.

## Explicit non-goals

- rebuilding a generic agent control plane;
- rebuilding a harness's sessions, runs, approvals, memory, skills, tools, or scheduling;
- forcing every harness to expose identical capabilities;
- building ChatGPT-specific product state into V1.

ChatGPT plugin / Apps SDK / MCP remains a possible V2+ distribution channel, not a V1 dependency.

## Project truth

Read in order:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATE.md`](STATE.md)
3. [`ROADMAP.md`](ROADMAP.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)
5. [`docs/decisions/`](docs/decisions/)

Current execution order: **Hermes MVP -> production web path -> OpenClaw connector -> additional channels/harnesses when justified.**
