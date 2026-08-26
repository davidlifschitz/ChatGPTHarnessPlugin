# Hermes Consumer Layer — Project Overview

This repository is the canonical source of truth for a consumer distribution layer over Nous Research's Hermes Agent and Hermes Cloud.

## End goal

A normal user should be able to open a mobile or desktop web experience, sign in, get or connect a Hermes agent, and use it without understanding Hermes infrastructure.

## Product boundary

Nous/Hermes owns the agent runtime. We reuse supported upstream capabilities rather than reproducing them.

This product may own only the gaps required for a consumer product:

- onboarding and account UX;
- user-to-Hermes-agent/instance mapping;
- a simplified chat/task experience;
- minimal server-side credential mediation;
- product-level permissions and entitlements when upstream controls are insufficient;
- billing/product analytics if needed;
- future distribution-channel adapters.

## What we do not own by default

Unless a concrete verified gap requires it, do not implement our own:

- agent execution engine;
- task/run state machine;
- session persistence;
- long-term memory system;
- tool/skill/MCP orchestration;
- approval engine;
- model gateway;
- cloud runtime lifecycle engine;
- generic multi-harness abstraction.

Hermes already exposes supported APIs for chat, runs, sessions, capabilities, skills/toolsets, streaming, and control. Nous Portal/Hermes Cloud provides hosted instances and lifecycle management.

## V1 principle: prove before wrapping

For each proposed backend component, first answer:

1. Does Hermes or Nous Portal already provide this capability?
2. Can the consumer UI use that supported surface safely?
3. If not, what is the smallest mediation layer required?

Custom infrastructure must be justified by an observed product gap, not by architectural preference.

## V1 delivery path

The first usable channel is a mobile-friendly web experience. We should prefer adapting a proven OpenAI-compatible frontend for the earliest real end-to-end test if it meets the UX and security requirements, then replace or customize only the parts that matter.

## Future channels

ChatGPT plugin/Apps SDK/MCP integration is V2+ work. It should eventually consume the same product/account boundary, but V1 must not depend on ChatGPT-specific APIs or packaging.

## Development rules

1. Verify upstream capabilities before designing replacements.
2. Keep secrets server-side; never put Portal/Hermes credentials in browser code, prompts, logs, or source control.
3. Add custom durable state only when product requirements cannot be satisfied by supported Hermes/Nous state.
4. Preserve upstream semantics rather than inventing parallel task/session models.
5. Do not add a second harness until there is a concrete user-facing reason.
6. Unsupported or unverified features are explicit.
7. Update `STATE.md` only when reality has been verified.
8. Long-lived architecture changes require an ADR.
9. ChatGPT-specific work stays under future-channel scope until V2 is explicitly started.

## Current milestone

**M1 — Thin Consumer Path**

Prove a real browser-based user flow over a real Hermes instance using supported Hermes/Nous interfaces with as little custom backend as possible.