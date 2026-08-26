# Harness Consumer Layer — Roadmap

This roadmap follows two rules:

1. reuse each harness's supported upstream capabilities before building replacements;
2. ship one harness at a time rather than delaying the MVP for hypothetical generalization.

Hermes is the first harness. OpenClaw is the planned second harness.

## M0 — Product Reset

**Goal:** remove the assumption that we should rebuild a generic agent control plane while preserving a harness-neutral consumer product boundary.

**Gate:**
- canonical docs define a thin multi-harness consumer layer;
- the old shared control-plane architecture is superseded;
- Hermes is identified as the MVP harness rather than the product identity;
- OpenClaw is identified as the planned second harness;
- ChatGPT is moved to V2+ distribution-channel scope;
- custom backend work requires upstream-gap evidence.

## M1 — Hermes Thin Consumer Path

**Goal:** prove that a real user can use a real Hermes agent through a browser without a bespoke agent backend.

**Work:**
- verify the existing Hermes Cloud instance's API-server/network surface;
- enable/use the Hermes API server with safe server-side credentials;
- deploy a manual-test web surface, including Vercel where useful;
- connect a proven compatible frontend or minimal test UI;
- verify streaming/tool activity;
- verify session creation/resume/history;
- verify stable per-user session-key/memory scoping;
- verify at least one agent tool workflow end-to-end;
- document every UX/security/product gap discovered.

**Gate:** a deployed browser client completes a real Hermes task end-to-end, including manual phone/browser testing, and remaining custom-product gaps are evidence-backed rather than assumed.

## M2 — Minimal Consumer Product Layer

**Goal:** implement only the shared consumer gaps identified by M1 while keeping Hermes transport behind a thin connector seam.

Potential work is conditional on M1 findings and may include:
- consumer sign-in/onboarding;
- user-to-harness/agent connection mapping;
- server-side credential mediation;
- simplified agent creation/selection;
- product-specific entitlement checks;
- hiding administrative harness surfaces;
- light frontend customization or replacement;
- a minimal connector interface around Hermes transport/capabilities.

**Gate:** each custom component has a documented product/upstream gap, normal users never need raw harness credentials, and Hermes-specific transport details do not leak throughout product-facing code.

## M3 — Multi-User Isolation and Provisioning

**Goal:** safely support more than one unrelated consumer on Hermes.

**Work, only where upstream mechanisms are insufficient:**
- choose the supported Hermes isolation boundary;
- automate account-to-agent provisioning/mapping;
- enforce authorization before proxying to Hermes;
- verify session/memory isolation across test users;
- define deletion/offboarding behavior.

**Gate:** two test users cannot access each other's agent, sessions, memory, credentials, or administrative controls.

## M4 — Hermes Production Web MVP

**Goal:** ship a stable mobile-friendly public product using Hermes as the first harness.

**Work:**
- production HTTPS deployment;
- safe secret storage;
- rate/abuse controls where required;
- observability without logging sensitive content/secrets;
- onboarding/error UX;
- privacy/retention documentation;
- regression and real-Hermes E2E coverage;
- rollback procedures;
- repeated manual testing from desktop and phone.

**Gate:** a supported user can sign up/connect, open the product on a phone, use a Hermes-backed agent, resume work, and use tools without seeing infrastructure setup.

## M5 — OpenClaw Second Harness

**Goal:** add OpenClaw as the second useful harness and use it to validate the harness connector boundary.

**Work:**
- research and verify current OpenClaw programmatic/runtime surfaces;
- document its auth, lifecycle, session/state, streaming, tools, and isolation semantics without assuming Hermes equivalence;
- implement the smallest OpenClaw connector needed by the existing consumer product;
- revise the connector contract where real differences require it;
- keep OpenClaw-native durable runtime state upstream;
- verify the same core consumer journey through OpenClaw where supported;
- expose capability differences honestly in the UI.

**Gate:** a user can select/use an OpenClaw-backed agent through the same consumer product without a forked frontend/account system or a duplicated generic agent control plane.

## M6 — Product Economics and Growth Layer

**Goal:** add commercial/product systems after the core product and second-harness architecture are demonstrated.

Possible work:
- billing/subscriptions;
- usage/entitlements;
- product analytics;
- referral/discovery/onboarding improvements;
- lifecycle automation for per-user harness capacity.

**Gate:** economics and lifecycle behavior are measurable and users do not need to manage harness infrastructure manually.

## V2+ — Additional Distribution Channels

ChatGPT plugin / Apps SDK / MCP is a future client channel, not a core architecture dependency.

Other possible channels include native mobile, Telegram, or partner integrations. A channel should reuse the same consumer/account and harness-connector boundaries.

## Additional harnesses

After Hermes and OpenClaw, add another harness only when it brings concrete capability, deployment, cost, or distribution value. Do not collect adapters merely to satisfy abstraction aesthetics.

## Development sequencing rule

**Hermes MVP first. OpenClaw second. Generalize only from evidence produced by those implementations.**
