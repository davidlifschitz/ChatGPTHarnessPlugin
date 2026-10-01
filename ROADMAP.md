# ChatGPT Harness Plugin — Roadmap

This roadmap follows four rules:

1. use ChatGPT's native plugin/MCP path before building a separate consumer surface;
2. reuse each harness's supported runtime capabilities before building replacements;
3. keep the harness/runtime infrastructure invisible to users;
4. ship one harness at a time rather than pre-generalizing.

Hermes is first. OpenClaw is second.

## M0 — DevDay 2026 Product Reset

**Goal:** replace the outdated assumption that ChatGPT must wait until V2+.

**Status:** complete in planning once ADR 0006 is accepted.

Verified platform facts:

- ChatGPT developer mode provides full MCP read/write tool support on Plus and Pro.
- A personal plugin can connect to a deployed HTTPS MCP endpoint.
- Plugins can combine skills and MCP connections.
- Public plugins can be submitted to the universal directory shared by ChatGPT and Codex.
- Authenticated MCP servers use OAuth 2.1.

Sources:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

**Gate:** canonical project docs make ChatGPT the primary V1 surface and demote the standalone web UI to diagnostics/admin use.

## M1 — Plus Personal Plugin Proof

**Goal:** prove the new ChatGPT-side path before touching public distribution or multi-user complexity.

**Work:**
- add a minimal streamable-HTTP MCP endpoint at a stable HTTPS `/mcp` URL;
- expose one harmless read-only canary tool;
- expose one controlled write/action canary tool with explicit semantics;
- connect the endpoint as a personal plugin in ChatGPT developer mode on Plus;
- verify the tools are visible and invocable from a normal ChatGPT conversation;
- verify errors are model-readable and no secrets are exposed;
- keep the existing Vercel REST surface available for direct diagnostics.

**Gate:** from the user's Plus account, ChatGPT successfully invokes our own read tool and controlled write/action tool through the deployed MCP endpoint.

This milestone proves the product channel, not Hermes yet.

## M2 — Hermes Plugin End-to-End

**Goal:** complete one real Hermes task from ChatGPT through our MCP boundary.

**Work:**
- retain/reuse the existing Hermes connector logic where useful;
- select the supported Hermes runtime origin for the proof;
- if managed Hermes Cloud still lacks supported session/chat ingress, deploy official Hermes on operator-controlled persistent infrastructure under ADR 0005;
- secure server-to-server access to the Hermes API server;
- verify `/v1/capabilities`, `/v1/models`, and `/api/sessions`;
- implement the smallest goal-level MCP tools needed to start/send/inspect/continue/stop work;
- run exactly one minimal real Hermes turn;
- run one tool-capable task;
- verify session continuity and expected restart persistence;
- verify ChatGPT never receives `API_SERVER_KEY` or provider credentials;
- manually test the essential plugin flow on every ChatGPT surface we intend to support; mobile availability remains a release requirement to verify, not an assumption.

Hermes references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables

**Gate:** a normal ChatGPT conversation delegates a real task to Hermes through our plugin and receives the result, with no harness infrastructure exposed to the user.

## M3 — User Authentication and Isolation

**Goal:** safely support more than one unrelated user.

**Work:**
- implement MCP OAuth 2.1 using a supported identity provider;
- publish protected-resource/auth metadata required by the MCP authorization spec;
- scope every tool request to the authenticated user;
- choose and verify the Hermes isolation boundary (profiles, dedicated runtimes, stable session keys, or a combination);
- enforce user-to-runtime/session authorization before calling Hermes;
- verify two test users cannot access each other's sessions, memory, credentials, filesystem/tool context, or controls;
- define deletion/offboarding and cleanup;
- add resource/cost limits where required.

OpenAI auth reference:

- https://developers.openai.com/plugins/build/auth

**Gate:** two independent users can use the plugin without cross-user access or secret leakage.

## M4 — Public Plugin Package and Submission

**Goal:** turn the working private integration into a publishable product.

**Work:**
- package the plugin with `plugin.json`, skills if justified, and MCP configuration;
- choose a non-generic public product name before submission;
- complete developer identity verification;
- provide required website/support/privacy/terms URLs;
- prepare a fully featured review account if authenticated review requires it;
- pass package validation and MCP tool scanning;
- document retention/security behavior;
- add production observability without sensitive payload leakage;
- run reliability and abuse/error-path testing;
- submit for review;
- publish only after approval and final manual validation.

Sources:

- https://developers.openai.com/plugins/build/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/plugin-guidelines

**Gate:** the plugin is approved and publishable in the universal directory, and the supported end-user path works without developer mode.

## M5 — Events and Native Plugin UX

**Goal:** improve the agent experience after the core path is reliable.

Potential work, only when justified:
- MCP Events for completion/progress notifications;
- optional plugin UI for agent/session/status views;
- better account switching/profile display;
- richer confirmation flows;
- file/result viewers where useful.

Event reference:

- https://developers.openai.com/plugins/build/mcp-events

**Gate:** each enhancement removes a measured user friction rather than duplicating ChatGPT or harness behavior.

## M6 — OpenClaw Second Harness

**Goal:** add OpenClaw and validate the adapter boundary.

**Work:**
- verify current OpenClaw programmatic/runtime surfaces;
- document auth, lifecycle, state, streaming, tools, and isolation without assuming Hermes equivalence;
- implement the smallest adapter needed by the existing MCP tool outcomes;
- revise the adapter contract where real differences require it;
- keep OpenClaw-native durable state upstream;
- verify the same core ChatGPT journey where supported.

**Gate:** the plugin can route a supported user journey to either Hermes or OpenClaw without a forked ChatGPT/product identity system or a duplicated generic control plane.

## M7 — Product Economics and Growth

**Goal:** add commercial systems after the product and second-harness architecture are demonstrated.

Possible work:
- billing/subscriptions;
- usage/entitlements;
- product analytics;
- onboarding improvements;
- lifecycle/capacity automation based on measured usage.

**Gate:** economics and lifecycle behavior are measurable and users never manage harness infrastructure manually.

## Standalone web client

The existing Vercel UI remains a diagnostic/admin/test surface throughout M1–M3.

A consumer standalone web app is **not** on the critical path. Promote it back to a primary channel only if a verified plugin limitation or product requirement justifies a new ADR.

## Sequencing rule

**Prove ChatGPT Plus -> our MCP endpoint first. Then prove ChatGPT -> MCP -> Hermes. Add auth/isolation. Publish. Only then add OpenClaw and generalize from evidence.**
