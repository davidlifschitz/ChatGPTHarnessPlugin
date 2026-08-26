# Hermes Consumer Layer — Architecture

This document contains the long-lived architecture constraints for the consumer product. For verified reality see `STATE.md`; for sequencing see `ROADMAP.md`.

## Objective

Provide a simple consumer experience over Hermes without duplicating capabilities that Nous Research already maintains.

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
  - user -> Hermes mapping
  - secret mediation
  - product entitlements
          |
          +-----------------------------+
          |                             |
          v                             v
Hermes API Server                Nous Portal / Cloud
chat / runs / sessions           hosting / lifecycle
capabilities / streaming         account/org operations
          |
          v
Hermes Agent
models / tools / skills / memory / execution
```

## Upstream-first boundary

The default architecture is to call supported Hermes/Nous interfaces directly or through the smallest safe server-side proxy.

The product must not create parallel implementations of upstream behavior merely to normalize it into our own domain model.

Before adding a service, table, queue, state machine, adapter, or API, document the required user behavior and the upstream gap preventing Hermes/Nous from satisfying it.

## Hermes execution boundary

Hermes is the execution system. Current supported programmatic surfaces include:

- OpenAI-compatible chat completions;
- Responses API;
- asynchronous runs and lifecycle events;
- approvals, steering, and stop controls;
- session CRUD/history/fork/chat/stream operations;
- machine-readable capabilities;
- skill/toolset discovery;
- stable session-key scoping for multi-user memory.

We preserve those semantics instead of inventing a second task/session model.

Authoritative upstream references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

## Nous Portal / Hermes Cloud boundary

Nous owns subscription-backed model/tool access and hosted Hermes lifecycle where supported. Portal MCP currently provides authenticated organization-scoped discovery and lifecycle actions for Hermes Cloud instances.

The product should consume supported lifecycle capabilities rather than maintain an independent cloud scheduler/provisioner unless a verified public-product requirement cannot be met upstream.

Reference:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

## Consumer frontend boundary

V1 should begin with the least custom frontend capable of proving the real experience. Hermes explicitly supports OpenAI-compatible frontends such as Open WebUI, LobeChat, LibreChat, NextChat, and ChatBox.

An off-the-shelf frontend is a replaceable client, not the product architecture. We customize or replace it only when testing identifies meaningful UX/product gaps.

The consumer surface must hide infrastructure/admin concepts such as raw API keys, model-provider setup, MCP configuration, environment variables, and system operations unless a future advanced mode intentionally exposes them.

## Identity and isolation

Do not assume we need an independent tenant system until the M1/M2 experiments determine the required upstream isolation model.

Possible supported boundaries include:

- dedicated Hermes Cloud instance per user/account;
- Hermes profiles with separate config/memory/API server credentials;
- stable `X-Hermes-Session-Key` values for user/channel memory scoping.

The production choice must be verified against real cross-user isolation requirements before public release.

Client-provided identifiers are never sufficient authorization by themselves.

## Secrets

Secrets remain server-side.

Never:

- ship Hermes API keys to browser JavaScript;
- commit Portal refresh/access tokens;
- place credentials in model prompts;
- return credentials in API/tool results;
- log raw bearer/refresh tokens.

If an off-the-shelf frontend requires a secret in browser-accessible configuration, insert a server-side mediation layer rather than accepting that exposure.

## Durable state

Prefer upstream Hermes state whenever it is authoritative for agent behavior: sessions, messages, runs, memory, approvals, skills, and capabilities.

Our database should contain only product-owned state that cannot live upstream cleanly, for example consumer identity, instance mapping, entitlements, billing references, or product preferences.

Do not mirror Hermes state into a second database without a specific query, reliability, or product requirement.

## Errors and capability detection

Clients should use Hermes' advertised capabilities and actual HTTP responses. Do not pretend unsupported features exist.

Our product layer may translate upstream failures into user-friendly UX, but diagnostics should retain enough upstream context for operators without leaking secrets.

## Future channels

ChatGPT plugin/Apps SDK/MCP is V2+. It should become another client of the minimal product/account boundary and/or supported Hermes APIs. It must not cause V1 to introduce ChatGPT-specific domain state.

Additional harnesses are also out of scope until a concrete product requirement justifies them.

## Source-of-truth hierarchy

When artifacts disagree:

1. observed behavior against the real deployed integration;
2. authoritative current Hermes/Nous documentation;
3. `STATE.md`;
4. accepted current ADRs and this architecture document;
5. `ROADMAP.md` / `PROJECT.md`;
6. implementation plans;
7. older conversation history.