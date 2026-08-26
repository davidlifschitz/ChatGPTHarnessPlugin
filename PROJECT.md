# Harness Consumer Layer — Project Overview

This repository is the canonical source of truth for a consumer distribution layer over general-purpose agent harnesses.

## End goal

A normal user should be able to open a mobile or desktop experience, sign in, receive or choose an agent, and use it without understanding which harness, model provider, cloud host, MCP server, container, tunnel, or runtime process is underneath.

The customer should experience an agent product, not infrastructure administration.

## Harness strategy

The product is multi-harness by design and sequential by implementation.

- **Hermes is the MVP harness.** Its supported API server, sessions, tools, memory, and model/provider integrations give us the shortest path to proving the product thesis.
- **OpenClaw is the planned second harness.** It validates the connector boundary against a materially different runtime.
- Additional harnesses are added only for concrete user value.

Do not delay Hermes to solve hypothetical cross-harness abstractions.

## Hosting strategy

Harness software and harness hosting are separate decisions.

For M1, the product operator controls the environment needed to make Hermes safely machine-accessible. The preferred starting point is the official Hermes runtime on a persistent cloud VM/container host with secure ingress.

Third-party managed harness hosting may be used later if it exposes a supported machine API, authentication, lifecycle, persistence, and networking contract. It is never assumed to be required.

Nous Portal may still provide Hermes model/tool authentication and provider access. Nous-managed Hermes Cloud is an optional hosting path, not the product architecture and not the M1 blocker.

## Product boundary

Each harness remains authoritative for its own runtime semantics and durable agent state. We reuse supported upstream capabilities rather than reproducing them.

This product may own shared consumer concerns such as:

- onboarding and account UX;
- user-to-harness/agent mapping;
- simplified consumer interaction;
- server-side credential mediation;
- product permissions and entitlements where upstream controls are insufficient;
- billing/product analytics when needed;
- lifecycle automation only after M1 proves what must be automated;
- future distribution-channel adapters.

## Runtime-operations boundary

Operating a harness on infrastructure we control is allowed and expected when required for secure machine access. That operational responsibility must not expand into a duplicate harness runtime.

We may own:

- VM/container deployment configuration;
- secure network ingress;
- secret injection;
- persistent volumes;
- health/restart policy;
- later provisioning automation if a product requirement proves it necessary.

We do not own by default:

- agent execution semantics;
- generic task/run state machines;
- mirrored session persistence;
- long-term agent memory;
- tool/skill/MCP orchestration;
- approvals;
- model routing;
- harness-native session/run lifecycle.

## Harness connector boundary

A connector may handle authentication, endpoint discovery, capability discovery, request/response/stream transport, stable upstream references, and harness-specific errors.

A connector must not become a parallel task engine, session store, memory system, scheduler, or model gateway.

Capability differences are real. The product must not fabricate common behavior simply to make harnesses look identical.

## MVP principle: prove the user journey

For every proposed component ask:

1. Does the harness already provide the behavior?
2. Can we operate that behavior safely on infrastructure we control?
3. What is the smallest product mediation needed for a normal user?

The M1 success criterion is not a particular vendor cloud. It is a real end-to-end user journey.

## V1 delivery path

The first usable channel is a mobile-friendly web experience backed by Hermes. Vercel is the current consumer surface. Hermes runs behind a secure server-to-server path on operator-controlled infrastructure.

## Future channels

ChatGPT plugin / Apps SDK / MCP integration is V2+ work. It should consume the same product and harness connector boundaries rather than define them.

## Development rules

1. Verify upstream harness capabilities before designing replacements.
2. Separate harness choice from hosting-provider choice.
3. Keep harness/provider secrets server-side.
4. Operate the minimum infrastructure needed for reliable machine access; hide it completely from users.
5. Preserve upstream runtime semantics rather than inventing parallel task/session models.
6. Add custom durable state only for product-owned concerns or verified upstream gaps.
7. Keep product-facing code harness-neutral where practical and transport-specific behavior inside connectors.
8. Do not generalize the connector beyond evidence from implemented harnesses.
9. Hermes ships first; OpenClaw is next after the Hermes web MVP.
10. Unsupported or unverified features remain explicit.
11. Update `STATE.md` only with verified reality.
12. Long-lived architecture changes require an ADR.
13. ChatGPT-specific work stays in V2+ scope until explicitly started.

## Current milestone

**M1 — Hermes Controlled-Runtime End-to-End**

Prove that a user can open the protected web client on phone/desktop and complete a real Hermes task while Hermes runs persistently on infrastructure controlled by the product operator. The user must not manage or see the underlying runtime setup.
