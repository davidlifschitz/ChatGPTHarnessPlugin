# Harness Consumer Layer

A thin consumer product over powerful general-purpose agent harnesses.

**Hermes is the first harness, not the product identity. OpenClaw is the planned second harness.**

## Goal

A normal person should be able to open a phone or browser, sign in, receive or choose an agent, and use it without understanding terminals, MCP, API keys, model providers, VPSs, tunnels, containers, or harness administration.

The infrastructure can be technical. The user experience cannot be.

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
Thin harness connector
  |
  +-------> product-operated Hermes runtime (MVP)
  |
  +-------> product-operated OpenClaw runtime (next)
  |
  +-------> future harnesses when justified

Harness runtimes -> upstream model/tool/provider services as configured
```

The product reuses each harness's execution, sessions, memory, tools, skills, approvals, and model routing. It does not rebuild those systems into another agent platform.

## Runtime ownership

For the MVP, **we control the runtime environment needed to make the harness safely machine-accessible**. That may be a VM, container host, or another replaceable cloud runtime.

This does not mean users manage infrastructure. It means the product operator does.

Managed harness hosting is welcome when it exposes the machine API, authentication, lifecycle, persistence, and networking the product requires. It is not a dependency. A human-facing vendor dashboard is not accepted as the product's runtime boundary merely because it hosts the harness.

Nous Portal can still provide Hermes model/tool authentication and provider access. Nous-managed Hermes Cloud is optional rather than the M1 critical path.

## MVP: Hermes

M1 proves one real phone/browser -> Vercel -> Hermes path using an official Hermes runtime on infrastructure we control.

The MVP should:

- run Hermes persistently;
- persist Hermes configuration/sessions/memory using Hermes-native storage;
- expose the authenticated Hermes API server only through a secure machine path;
- let the existing Vercel server-side connector discover capabilities/models/sessions;
- complete one real tool-capable Hermes turn;
- survive restart without losing the expected Hermes state;
- work from phone and desktop without exposing infrastructure to the user.

The current official Hermes docs support an authenticated API server and Docker deployment, including persistent host state and configurable network binding. Those upstream capabilities are the starting point; we add only the transport/security required to operate them safely.

## Second harness: OpenClaw

OpenClaw follows after the Hermes web MVP. Its job is both to add a useful second runtime and to reveal which connector behaviors are truly shared.

We do not force OpenClaw into fake Hermes semantics, and we do not pre-build a generic multi-harness runtime platform.

## Product-owned concerns

Only consumer/product concerns belong here by default:

- onboarding and sign-in;
- user-to-harness/agent mapping;
- harness selection;
- secure credential mediation;
- simplified permissions/entitlements;
- consumer UX;
- billing/product analytics when required;
- later lifecycle automation once proven necessary;
- future distribution channels.

## Explicit non-goals

- rebuilding harness execution;
- mirroring harness sessions/runs/memory;
- building a generic task engine or model gateway;
- making customers operate VPSs, tunnels, Docker, or harness CLIs;
- coupling V1 to Nous-managed Hermes Cloud;
- building ChatGPT-specific product state into V1.

ChatGPT plugin / Apps SDK / MCP remains a V2+ distribution channel.

## Project truth

Read in order:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATE.md`](STATE.md)
3. [`ROADMAP.md`](ROADMAP.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)
5. [`docs/decisions/`](docs/decisions/)

Current execution order: **operator-controlled Hermes M1 -> Hermes production web MVP -> OpenClaw connector -> additional harnesses/channels when justified.**
