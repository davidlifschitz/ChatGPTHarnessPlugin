# Hermes Consumer Layer — Roadmap

This roadmap sequences the product around one rule: reuse Nous/Hermes wherever possible and add custom infrastructure only when a verified consumer-product gap requires it.

## M0 — Product Reset

**Goal:** remove the assumption that we should rebuild a generic agent control plane.

**Gate:**
- canonical docs define the product as a thin consumer layer;
- old control-plane architecture is superseded by ADR;
- ChatGPT is moved to V2+ future-channel scope;
- roadmap requires upstream verification before custom backend work.

## M1 — Thin Consumer Path

**Goal:** prove that a real user can use a real Hermes agent through a browser without a bespoke agent backend.

**Work:**
- verify the existing Hermes Cloud instance's supported API-server/network surface;
- enable/use the Hermes API server with safe server-side credentials;
- connect a proven OpenAI-compatible frontend such as Open WebUI or LobeChat;
- verify streaming/tool activity;
- verify session creation/resume/history;
- verify stable per-user session-key/memory scoping;
- verify at least one agent tool workflow end-to-end;
- document every UX/security/product gap discovered.

**Gate:** a browser client completes a real Hermes task end-to-end using supported Hermes APIs, and the remaining custom-product gaps are evidence-backed rather than assumed.

## M2 — Minimal Consumer Product Layer

**Goal:** implement only the gaps identified by M1.

Potential work is conditional on M1 findings and may include:
- consumer sign-in/onboarding;
- user-to-Hermes-instance/profile mapping;
- server-side API credential mediation;
- simplified agent creation/selection;
- product-specific entitlement checks;
- hiding administrative Hermes surfaces;
- light frontend customization or replacement.

**Gate:** each custom component has a documented upstream gap that justifies its existence, and normal users never need raw Hermes/Nous credentials.

## M3 — Multi-User Isolation and Provisioning

**Goal:** safely support more than one unrelated consumer.

**Work, only where upstream mechanisms are insufficient:**
- define whether isolation uses dedicated Hermes Cloud instances, Hermes profiles, or another supported upstream boundary;
- automate account-to-agent provisioning/mapping;
- enforce authorization before proxying to Hermes;
- verify session/memory isolation across test users;
- define deletion/offboarding behavior.

**Gate:** two test users cannot access each other's agent, sessions, memory, credentials, or administrative controls.

## M4 — Production Web Release

**Goal:** ship a stable mobile-friendly web experience.

**Work:**
- production HTTPS deployment;
- safe secret storage;
- rate/abuse controls where required;
- observability without logging sensitive content/secrets;
- onboarding/error UX;
- privacy/retention documentation;
- regression and real-Hermes E2E coverage;
- rollback procedures.

**Gate:** a supported user can sign up/connect, open the product on a phone, converse with Hermes, resume work, and use tools without seeing infrastructure setup.

## M5 — Product Economics and Growth Layer

**Goal:** add commercial/product systems only after the core consumer experience is proven.

Possible work:
- billing/subscriptions;
- usage/entitlements;
- product analytics;
- referral/discovery/onboarding improvements;
- lifecycle automation for per-user Hermes capacity.

**Gate:** economics and lifecycle behavior are measurable and do not require users to manage Hermes infrastructure manually.

## V2+ — Additional Distribution Channels

ChatGPT plugin / Apps SDK / MCP is a future client channel, not a core architecture dependency.

Other possible channels include Telegram, native mobile, or partner integrations. Add a channel only when it reuses the same consumer/account boundary and provides concrete distribution value.

## Development sequencing rule

Do not create a generic task/session/runtime control plane unless M1/M2 prove that supported Hermes/Nous surfaces cannot satisfy a required behavior. Do not add additional harnesses merely to preserve an abstraction.