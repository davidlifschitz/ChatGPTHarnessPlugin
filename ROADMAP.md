# Harness Consumer Layer — Roadmap

This roadmap follows three rules:

1. reuse each harness's supported runtime capabilities before building replacements;
2. control the infrastructure boundary when required for safe machine access, while hiding it from users;
3. ship one harness at a time rather than pre-generalizing.

Hermes is first. OpenClaw is second.

## M0 — Product Reset

**Goal:** remove the generic agent-control-plane assumption while preserving a harness-neutral consumer product boundary.

**Gate:** complete. The product is a thin consumer layer; Hermes is the first harness; OpenClaw is next; ChatGPT is V2+; custom runtime semantics require evidence.

## M1 — Hermes Controlled-Runtime End-to-End

**Goal:** prove that a real user can use a real Hermes agent from a browser/phone while the product operator—not the user—owns the runtime infrastructure boundary.

**Work:**
- select the smallest practical cloud VM/container host;
- deploy the official Hermes runtime with persistent Hermes-native state;
- authenticate/configure Hermes providers through supported upstream mechanisms, including Nous Portal where useful;
- enable the Hermes API server with a server-side bearer key;
- expose it through a restricted machine-to-machine HTTPS path; do not expose the raw agent port openly;
- point the existing protected Vercel Preview at that machine origin;
- verify `/v1/capabilities`, `/v1/models`, and `/api/sessions`;
- run exactly one minimal real turn, then one tool-capable task;
- verify session continuity and restart persistence;
- verify desktop and phone UX;
- record remaining product/security gaps.

**Gate:** a protected deployed browser client completes a real Hermes task end-to-end on phone and desktop; expected Hermes state survives restart; the user sees no VPS/container/key/tunnel administration.

Managed Hermes Cloud is not required for this gate. It may be revisited if Nous exposes a supported machine-ingress contract.

## M2 — Minimal Consumer Product Layer

**Goal:** implement only the consumer gaps exposed by M1.

Potential work, only when M1 proves it is needed:
- consumer sign-in/onboarding;
- user-to-harness/runtime mapping;
- server-side credential mediation;
- simplified agent creation/selection;
- product entitlements;
- hiding harness administration;
- light frontend customization;
- a minimal Hermes connector interface;
- minimal runtime lifecycle automation for the single-harness product.

**Gate:** each custom component corresponds to a documented user/upstream gap, normal users never handle harness credentials/infrastructure, and Hermes transport details stay isolated.

## M3 — Multi-User Isolation and Provisioning

**Goal:** safely support more than one unrelated consumer.

**Work:**
- choose the supported Hermes isolation boundary based on real testing (profiles, dedicated runtimes, session keys, or a combination);
- automate user-to-runtime/agent provisioning where necessary;
- enforce authorization before proxying to Hermes;
- verify session/memory/credential isolation;
- define deletion/offboarding and resource cleanup;
- establish resource/cost limits.

**Gate:** two test users cannot access each other's agent, sessions, memory, credentials, filesystem/tool context, or administrative controls.

## M4 — Hermes Production Web MVP

**Goal:** ship a stable mobile-friendly public product using Hermes as the first harness.

**Work:**
- production HTTPS deployment;
- safe runtime/secret management;
- reliable harness process supervision and persistent storage;
- rate/abuse controls where required;
- observability without leaking sensitive content/secrets;
- onboarding/error UX;
- privacy/retention documentation;
- rollback/recovery procedures;
- real-Hermes regression/E2E coverage;
- repeated desktop/phone testing.

**Gate:** a supported user can sign up/connect, open the product on a phone, use a Hermes-backed agent, resume work, and use tools without knowing where or how Hermes is hosted.

## M5 — OpenClaw Second Harness

**Goal:** add OpenClaw as the second useful harness and validate the connector boundary.

**Work:**
- verify current OpenClaw runtime/programmatic surfaces;
- deploy it on an operator-controlled runtime boundary appropriate to OpenClaw;
- document auth, lifecycle, state, streaming, tools, and isolation without assuming Hermes equivalence;
- implement the smallest connector needed by the existing consumer product;
- revise the connector where real differences require it;
- keep OpenClaw-native durable state upstream;
- verify the same core user journey where supported.

**Gate:** a user can use an OpenClaw-backed agent through the same product without a forked account/frontend system or duplicated generic control plane.

## M6 — Product Economics and Growth

**Goal:** add commercial and lifecycle systems after the product and second-harness architecture are demonstrated.

Possible work:
- billing/subscriptions;
- usage/entitlements;
- product analytics;
- referral/onboarding improvements;
- lifecycle automation and capacity orchestration based on measured usage.

**Gate:** economics and lifecycle behavior are measurable and users never manage harness infrastructure manually.

## V2+ — Additional Distribution Channels

ChatGPT plugin / Apps SDK / MCP is a future client channel, not a core architecture dependency. Other channels may include native mobile, Telegram, or partner integrations.

## Additional harnesses

After Hermes and OpenClaw, add another harness only for concrete capability, deployment, cost, or distribution value.

## Sequencing rule

**Prove one operator-controlled Hermes user journey first. Automate only what that journey proves necessary. Then add OpenClaw and generalize from evidence.**
