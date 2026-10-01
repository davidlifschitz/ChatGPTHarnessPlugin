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

Current OpenAI platform evidence:

- OpenAI's developer homepage states that ChatGPT developer mode provides full MCP support for read and write tools in ChatGPT Plus and Pro.
- OpenAI's current Help Center page for developer mode/full MCP gives conflicting plan-specific availability: it says full MCP is currently available to Business and Enterprise/Edu, and that Pro can connect read/fetch MCPs.
- Because those official surfaces conflict, Plus write/action availability is an empirical M1 acceptance gate rather than a repository assumption.
- OpenAI's plugin quickstart documents a personal plugin connecting to a deployed public HTTPS MCP endpoint and being invoked from ChatGPT Work on the web.
- Plugins can combine skills and MCP connections.
- Public plugins can be submitted to the universal directory shared by ChatGPT and Codex.
- Authenticated MCP servers use OAuth 2.1.

Sources:

- https://developers.openai.com/chatgpt
- https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

**Gate:** canonical project docs make ChatGPT the primary V1 surface and demote the standalone web UI to diagnostics/admin use.

## M1 — Plus Personal Plugin Proof

**Goal:** empirically prove the intended ChatGPT-side path on the user's actual Plus account before touching public distribution or multi-user complexity.

**Status:** complete / green as of 2026-10-01.

**Work:**
- add a minimal streamable-HTTP MCP endpoint at a stable HTTPS `/mcp` URL;
- expose one harmless read-only canary tool;
- expose one controlled write/action canary tool with explicit semantics;
- make the dedicated test endpoint publicly reachable without Vercel deployment authentication;
- connect the endpoint as a personal plugin in ChatGPT developer mode on the user's Plus account;
- verify the tools are visible and invocable from a normal ChatGPT Work conversation;
- verify errors are model-readable and no secrets are exposed;
- keep the existing Vercel REST surface available for direct diagnostics.

**Gate:** from the user's actual Plus account, ChatGPT successfully invokes our own read tool and controlled write/action tool through the deployed MCP endpoint.

**Verified completion evidence (2026-10-01):**
- the private personal plugin connected to the deployed M1 endpoint and exposed the two intended canary tools;
- `get_m1_status` returned `ready` / `m1-canary-v1` from ChatGPT;
- `run_m1_canary_action("david-manual-test")` returned receipt `m1_15808f73-b006-427b-aef2-4a31d393264c`;
- the same receipt was independently matched in Vercel runtime logs on `POST /mcp 200`;
- empty-label validation rejected the action without a successful receipt;
- the status-only check invoked only the read tool;
- `17 × 23` used no plugin tool;
- the sensitive-data check used no plugin tool and exposed no server secrets or configuration.

The gate is satisfied. This milestone proves the product channel, not Hermes yet.

## M2 — Hermes Plugin End-to-End

**Status:** in progress. The adapter/MCP/runtime-definition/CI/Preview implementation is green on the M2 branch, but the real Render runtime and ChatGPT -> Hermes acceptance gate are not yet verified.

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
- manually test the essential plugin flow on supported ChatGPT surfaces; current OpenAI Help Center guidance says MCP apps are web-only, so mobile is a future platform re-check rather than an M2 acceptance gate.

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

**M1 is complete: the user's Plus account can use our deployed MCP read and action tools. Next prove ChatGPT -> MCP -> Hermes in M2. Then add auth/isolation, publish, add OpenClaw, and generalize only from verified evidence.**
