# Harness Consumer Layer — Project Overview

This repository is the canonical source of truth for a consumer distribution layer over general-purpose agent harnesses.

## End goal

A normal user should be able to open a mobile or desktop web experience, sign in, choose or receive an agent, and use it without understanding which harness, model provider, cloud host, MCP server, or runtime process is underneath.

## Harness strategy

The product is multi-harness by design, but implementation is deliberately sequential.

- **Hermes is the MVP harness.** Nous Research's hosted infrastructure and supported APIs make it the fastest path to a real product.
- **OpenClaw is the planned second harness.** It will be used to expand the product and validate the connector boundary against a materially different runtime.
- Additional harnesses are added only when they create concrete user value.

Do not delay the Hermes MVP to solve hypothetical cross-harness abstractions.

## Product boundary

Each harness remains authoritative for its own runtime semantics and durable agent state. We reuse supported upstream capabilities rather than reproducing them.

This product may own shared consumer concerns such as:

- onboarding and account UX;
- selected harness and user-to-agent/instance connection mapping;
- a simplified consumer interaction surface;
- minimal server-side credential mediation;
- product-level permissions and entitlements when upstream controls are insufficient;
- billing/product analytics if needed;
- future distribution-channel adapters.

## Harness connector boundary

Harness-specific transport should sit behind the smallest practical connector seam once product code requires it.

A connector may handle:

- connection and authentication details;
- endpoint/lifecycle discovery;
- capability discovery;
- request, response, event, and stream transport;
- stable upstream identifier references where required;
- harness-specific error translation.

A connector must not become a parallel task engine, session store, memory system, tool orchestrator, scheduler, or model gateway.

Capability differences are real. The product must not fabricate common behavior simply to make harnesses appear identical.

## What we do not own by default

Unless a concrete verified gap requires it, do not implement our own:

- agent execution engine;
- generic task/run state machine;
- mirrored harness session persistence;
- long-term agent memory system;
- tool/skill/MCP orchestration;
- approval engine;
- model gateway;
- generic cloud runtime scheduler.

## MVP principle: prove before wrapping

For each proposed component, first answer:

1. Does the selected harness already provide this capability?
2. Can the consumer product use that supported surface safely?
3. If not, what is the smallest product-owned mediation required?

Custom infrastructure must be justified by an observed product gap, not by architectural preference.

## V1 delivery path

The first usable channel is a mobile-friendly web experience backed by Hermes. Prefer adapting a proven compatible frontend for the earliest real end-to-end test if it meets UX/security requirements, then customize only where testing identifies meaningful gaps.

## Future channels

ChatGPT plugin / Apps SDK / MCP integration is V2+ work. It should consume the same consumer/account and harness-connector boundaries but must not define the core product architecture.

## Development rules

1. Verify upstream capabilities before designing replacements.
2. Keep harness and provider secrets server-side.
3. Add custom durable state only for product-owned concerns or verified upstream gaps.
4. Preserve upstream runtime semantics rather than inventing parallel task/session models.
5. Keep product-facing code harness-neutral where practical; isolate transport-specific details in connectors.
6. Do not generalize the connector contract beyond evidence from implemented harnesses.
7. Hermes ships first; OpenClaw is the next planned harness after the Hermes web MVP.
8. Unsupported or unverified features are explicit.
9. Update `STATE.md` only when reality has been verified.
10. Long-lived architecture changes require an ADR.
11. ChatGPT-specific work stays under future-channel scope until V2 is explicitly started.

## Current milestone

**M1 — Hermes Thin Consumer Path**

Prove a real browser-based user flow over a real Hermes instance using supported Hermes/Nous interfaces with as little custom backend as possible.
