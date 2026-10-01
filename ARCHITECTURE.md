# ChatGPT Harness Plugin — Architecture

This document contains long-lived architecture constraints. For verified reality see `STATE.md`; for sequencing see `ROADMAP.md`.

## Objective

Provide a simple ChatGPT-native experience over capable general-purpose agent harnesses without duplicating those harness runtimes or exposing infrastructure administration to users.

Hermes is the MVP harness. OpenClaw is the planned second harness.

## System shape

```text
ChatGPT
  |
  | plugin package
  | - skills
  | - MCP connection
  | - optional UI
  v
Public HTTPS MCP Service
  |
  | product concerns
  | - authn/authz
  | - user -> harness mapping
  | - goal-level tools
  | - confirmation/error policy
  v
Thin Harness Adapter Seam
       /        \
      v          v
   Hermes      OpenClaw
    MVP          next
      \          /
       v        v
Harness-native runtime/state
  |
  v
Model/tool/provider services
```

## ChatGPT plugin is the primary distribution boundary

The plugin is the V1 consumer surface.

OpenAI's current plugin architecture allows a package to include skills, an MCP server, or both, with optional UI:

- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/build/plugins

Developer-mode MCP support is available on Plus and Pro:

- https://developers.openai.com/chatgpt

The standalone Vercel UI is retained as diagnostics/admin/testing. It is not the default consumer product surface.

## Plugin package versus MCP service

Keep these responsibilities separate.

### Plugin package

The package describes how ChatGPT should use the product:

- skill instructions/resources;
- MCP server configuration;
- listing metadata;
- optional UI assets when justified.

It must not contain private server credentials.

### MCP service

The public HTTPS MCP endpoint is the execution/control boundary for ChatGPT:

- authenticate and authorize the end user;
- expose focused tools;
- resolve user -> harness/runtime mappings;
- call harness adapters;
- enforce confirmation and safety semantics;
- translate harness-specific failures into useful model-readable errors;
- record only product-owned operational data that is actually needed.

For public distribution, the MCP endpoint must be stable and publicly reachable over HTTPS:

- https://developers.openai.com/plugins/build/mcp-server

## Authentication boundary

Private user data and write actions require authenticated access.

The public MCP service should follow the MCP OAuth 2.1 model described by OpenAI:

- protected-resource metadata;
- authorization server discovery;
- authorization-code flow with PKCE;
- issuer/audience/scope verification on every request.

Reference:

- https://developers.openai.com/plugins/build/auth

ChatGPT authenticates to our MCP service. Our MCP service then authenticates to the selected harness/runtime using server-side credentials appropriate to that harness.

Do not pass Hermes `API_SERVER_KEY` to ChatGPT or expose it as a user credential.

## Harness adapter seam

A harness adapter may own:

- runtime endpoint discovery;
- server-side harness authentication;
- capability discovery;
- request/response/event/stream transport;
- mapping product tool outcomes to harness-native operations;
- stable upstream references where required;
- harness-specific diagnostics/error translation.

A harness adapter does **not** own:

- a generic agent runtime;
- a duplicate task/run engine;
- a mirrored session database;
- agent memory;
- tool/MCP orchestration;
- a cross-harness scheduler;
- a generic model gateway.

The adapter contract evolves from evidence. Hermes defines the first implementation; OpenClaw validates/revises it.

## Tool surface

Do not mirror every internal harness endpoint as a plugin tool.

Each MCP tool should correspond to a recognizable user goal and expose only the inputs/actions required for that goal.

Reference:

- https://developers.openai.com/plugins/plan/tools

Likely first outcomes:

- discover/select an available agent;
- start a new unit of work;
- send or continue work;
- inspect status/output;
- stop an active run.

The exact schema should be designed against the real Hermes integration rather than frozen in advance.

## Hermes adapter — MVP

Hermes exposes the primitives required for the consumer thesis:

- OpenAI-compatible chat;
- REST sessions;
- asynchronous runs and control;
- streaming;
- capabilities/models;
- skills/toolsets;
- stable session-key memory scoping.

References:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

Hermes' API server requires `API_SERVER_KEY` and defaults to `127.0.0.1:8642`:

- https://hermes-agent.nousresearch.com/docs/reference/environment-variables

Therefore the product must provide a secure machine path from the MCP service to Hermes. The browser/ChatGPT client never receives the Hermes key.

## Managed Hermes Cloud

Nous Portal exposes an OAuth-gated MCP server for Hermes Cloud lifecycle management:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

Documented operations include instance list/status/cost and create/start/stop/restart/destroy/update actions.

That is useful for lifecycle management, but the documented surface is not the same as Hermes' session/chat API. Do not assume it solves conversation transport.

Until a supported managed-cloud session/chat ingress is verified, an operator-controlled Hermes runtime remains an allowed implementation under ADR 0005.

## Sign in with ChatGPT

OpenAI currently lists Hermes Agent as an app that can use eligible Plus/Pro ChatGPT plan usage:

- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

This may simplify how Hermes obtains model usage for a user.

It does not change the architecture requirement that ChatGPT calls our MCP service and that our MCP service reaches a Hermes runtime through a supported transport.

## Identity and isolation

Shared product identity may map to different upstream isolation mechanisms per harness.

For Hermes, candidate boundaries include profiles, dedicated runtimes, and stable `X-Hermes-Session-Key` values. The production choice must be verified by cross-user testing rather than assumed.

Client-provided identifiers are never sufficient authorization by themselves.

## Secrets

Secrets remain server-side.

Never ship harness/provider credentials to:

- plugin package files;
- browser JavaScript;
- model prompts;
- tool outputs;
- logs;
- source control.

Validate every MCP input server-side and enforce authorization independent of model behavior.

Security reference:

- https://developers.openai.com/plugins/guides/security-privacy

## Durable state

Prefer harness-native state whenever it is authoritative for agent behavior: sessions, messages, runs, memory, approvals, tools, capabilities, or equivalent constructs.

Our database, when required, contains product-owned state such as:

- user identity;
- harness/runtime mapping;
- entitlements;
- OAuth/account linkage;
- billing references;
- product preferences.

Do not mirror harness runtime state just to create symmetry.

## Events and automations

MCP Events is a later enhancement, not an MVP dependency.

Once the core Hermes path works, events may let the plugin surface completion/progress changes without manual polling.

Reference:

- https://developers.openai.com/plugins/build/mcp-events

## Public distribution

Public submission requires a plugin package, a stable production MCP service, developer identity/review requirements, and the required listing/review materials.

Reference:

- https://developers.openai.com/plugins/deploy/submission

Do not start directory-polish work before the private Plus proof and Hermes E2E path work.

## Source-of-truth hierarchy

When artifacts disagree:

1. observed behavior against the real deployed integration;
2. authoritative current OpenAI/Hermes/OpenClaw documentation;
3. `STATE.md`;
4. accepted current ADRs and this architecture document;
5. `ROADMAP.md` / `PROJECT.md`;
6. implementation plans;
7. older conversation history.
