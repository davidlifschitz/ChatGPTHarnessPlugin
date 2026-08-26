# Harness Consumer Layer — Architecture

This document contains the long-lived architecture constraints for the consumer product. For verified reality see `STATE.md`; for sequencing see `ROADMAP.md`.

## Objective

Provide one simple consumer experience over capable general-purpose agent harnesses without duplicating the runtimes those projects already maintain.

Hermes is the first MVP harness. OpenClaw is the planned second harness. The product boundary is therefore harness-neutral, while implementation remains upstream-first and harness-specific behind a thin connector seam.

## System shape

```text
mobile / desktop browser
          |
          v
Consumer Web Surface
          |
          v
Minimal Product Boundary
  - authentication/onboarding, if needed
  - user -> harness/agent mapping
  - harness selection
  - secret mediation
  - product entitlements
          |
          v
Thin Harness Connector Seam
       /        \
      v          v
 Hermes          OpenClaw
 MVP              next
  |
  +--> Hermes API Server
  |    chat / runs / sessions / capabilities
  |
  +--> Nous Portal / Hermes Cloud
       hosting / lifecycle where applicable
```

Future harnesses attach at the connector seam only when they provide concrete product value.

## Upstream-first boundary

The default architecture is to call the selected harness's supported interfaces directly or through the smallest safe server-side mediation layer.

The product must not create parallel implementations of upstream behavior merely to normalize everything into one artificial domain model.

Before adding a service, table, queue, state machine, adapter behavior, or API, document the required user behavior and the upstream gap preventing the chosen harness from satisfying it.

## Harness connector seam

The connector seam exists to keep consumer/product code from depending on one harness's transport details. It should stay deliberately small.

A connector may own:

- authentication/connection configuration;
- endpoint and lifecycle discovery;
- capability discovery and translation;
- request/response/event/stream transport;
- stable upstream identifier references where required;
- harness-specific diagnostics and error translation.

A connector does **not** own:

- a generic agent runtime;
- a duplicate task/run engine;
- a mirrored session database;
- agent memory;
- tool/MCP orchestration;
- a cross-harness scheduler;
- a generic model gateway.

The connector contract should evolve from evidence. Hermes defines the first implementation; OpenClaw is the planned second implementation that will validate or revise the seam.

## Capability model

Harness capabilities are not assumed to be identical.

The consumer surface can expose common product intents where they genuinely exist, but must remain capability-aware. If one harness lacks a feature, the product should hide, disable, or explain that feature rather than simulate it.

Do not create product-owned durable state solely to make two harnesses look symmetric.

## Hermes connector — MVP

Hermes is the first execution system because current Nous/Hermes infrastructure gives the project the shortest path to a hosted MVP.

Supported Hermes surfaces currently include:

- OpenAI-compatible chat completions;
- Responses API;
- asynchronous runs and lifecycle events;
- approvals, steering, and stop controls;
- session CRUD/history/fork/chat/stream operations;
- machine-readable capabilities and model discovery;
- skill/toolset discovery;
- stable session-key scoping for multi-user memory.

The Hermes connector should preserve those semantics rather than inventing a second task/session model.

Hermes/Nous references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

## OpenClaw connector — planned second harness

OpenClaw is the planned second harness after the Hermes production web MVP is working.

No OpenClaw runtime capability is treated as verified in this repository until it is researched and tested against current upstream behavior. The OpenClaw implementation should not be forced into Hermes endpoint names or semantics.

Its purpose is twofold:

1. provide a second useful harness to users;
2. reveal which parts of the connector seam are truly shared and which should remain harness-specific.

If OpenClaw exposes materially different primitives, revise the connector boundary rather than adding a large normalization layer.

## Consumer frontend boundary

The consumer frontend should be harness-neutral at the product level: the user chooses or receives an agent and interacts with it through a simple experience.

For M1, begin with the least custom frontend capable of proving the real Hermes experience. An off-the-shelf compatible frontend is a replaceable test/client surface, not the product architecture.

The consumer surface must hide infrastructure/admin concepts such as raw API keys, provider setup, MCP configuration, environment variables, and system operations unless a future advanced mode intentionally exposes them.

## Identity and isolation

Shared product identity may map to different upstream isolation mechanisms per harness.

For Hermes, possible supported boundaries include dedicated Hermes Cloud instances, Hermes profiles, and stable `X-Hermes-Session-Key` values. The production choice must be verified against real cross-user isolation requirements.

OpenClaw isolation must be determined from its own supported behavior when that milestone begins; do not assume it matches Hermes.

Client-provided identifiers are never sufficient authorization by themselves.

## Secrets

Secrets remain server-side.

Never:

- ship harness API keys to browser JavaScript;
- commit provider/Portal credentials;
- place credentials in model prompts;
- return credentials in API/tool results;
- log raw bearer/refresh tokens.

If a frontend requires a harness secret in browser-accessible configuration, insert a trusted server-side mediation layer.

## Durable state

Prefer upstream state whenever it is authoritative for agent behavior: sessions, messages, runs, memory, approvals, tools, capabilities, or equivalent harness-native constructs.

Our database should contain only product-owned state that cannot live upstream cleanly, such as consumer identity, selected harness/connection mapping, entitlements, billing references, and product preferences.

Do not mirror harness runtime state without a specific product, query, or reliability requirement.

## Deployment and manual testing

Vercel is an acceptable deployment target for the consumer web/product boundary and manual testing environments. Deployment configuration must not expose upstream harness credentials to client-side code.

A deployment is a validation surface, not proof that a harness feature works until the real upstream flow is exercised manually or in E2E tests.

## Future distribution channels

ChatGPT plugin / Apps SDK / MCP is V2+. It should become another client of the same consumer/account and harness-connector boundaries. It must not cause V1 to introduce ChatGPT-specific domain state.

Other possible channels include native mobile, Telegram, or partner integrations.

## Source-of-truth hierarchy

When artifacts disagree:

1. observed behavior against the real deployed integration;
2. authoritative current upstream harness documentation;
3. `STATE.md`;
4. accepted current ADRs and this architecture document;
5. `ROADMAP.md` / `PROJECT.md`;
6. implementation plans;
7. older conversation history.
