# Harness Consumer Layer — Architecture

This document contains long-lived architecture constraints. For verified reality see `STATE.md`; for sequencing see `ROADMAP.md`.

## Objective

Provide one simple consumer experience over capable general-purpose agent harnesses without duplicating those harness runtimes or exposing infrastructure administration to users.

Hermes is the MVP harness. OpenClaw is the planned second harness.

## System shape

```text
mobile / desktop browser
          |
          v
Consumer Web Surface (Vercel today)
          |
          v
Minimal Product Boundary
  - identity/onboarding when needed
  - user -> harness/runtime mapping
  - secret mediation
  - product entitlements
          |
          v
Thin Harness Connector Seam
       /        \
      v          v
 Hermes          OpenClaw
  MVP             next
      \           /
       v         v
Operator-controlled harness runtime environment
  - VM/container host
  - persistent harness-native data
  - health/restart policy
  - restricted machine ingress
          |
          v
Upstream model/tool/provider services
( Nous Portal or others as configured )
```

## Upstream-first does not mean hosting-provider-first

The product reuses upstream harness software, APIs, runtime semantics, sessions, memory, tools, skills, and provider integration.

It does **not** require a harness vendor to own the VM/network boundary.

When a managed hosting product does not expose the machine API contract required by our consumer product, we run the upstream harness on infrastructure we control instead of rebuilding the harness or emulating a human dashboard session.

A managed hosting option may be used when it exposes a supported machine API, authentication, lifecycle, persistence, and isolation contract.

## Runtime infrastructure boundary

The product operator may own the minimum infrastructure needed to run the harness reliably:

- VM/container deployment;
- persistent volumes;
- secret injection;
- network ingress/private connectivity;
- process health/restart behavior;
- backups/recovery where required;
- later provisioning/capacity automation after product evidence justifies it.

This infrastructure is an implementation detail hidden from consumers.

Operating infrastructure must not become an excuse to recreate harness semantics. Hermes/OpenClaw remain authoritative for agent execution and native state.

## Harness connector seam

A connector may own:

- authentication/connection configuration;
- endpoint and lifecycle discovery;
- capability discovery and translation;
- request/response/event/stream transport;
- stable upstream references where required;
- harness-specific diagnostics/error translation.

A connector does **not** own:

- a generic agent runtime;
- a duplicate task/run engine;
- a mirrored session database;
- agent memory;
- tool/MCP orchestration;
- a cross-harness scheduler;
- a generic model gateway.

The connector contract evolves from evidence. Hermes defines the first implementation; OpenClaw validates/revises it.

## Hermes connector — MVP

Hermes is first because its API server exposes the primitives required for the consumer thesis: OpenAI-compatible chat, runs, sessions, capabilities/model discovery, skills/toolsets, and stable memory/session scoping.

M1 runs an official Hermes runtime on an operator-controlled persistent host. The API server is enabled with server-side bearer authentication and reached only through restricted machine ingress. The browser never receives the Hermes key.

Nous Portal may be used by Hermes for model/tool authentication. Nous-managed Hermes Cloud is not required for execution hosting.

Hermes references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal

## Consumer frontend boundary

The frontend stays harness-neutral at the product level. Users interact with an agent, not a container, API server, provider token, tunnel, or cloud host.

For M1, the existing minimal Vercel surface is a validation client. It is replaceable.

## Identity and isolation

Shared product identity may map to different upstream isolation mechanisms per harness.

For Hermes, candidate boundaries include profiles, dedicated runtimes, and stable `X-Hermes-Session-Key` values. The production choice must be verified by cross-user testing rather than assumed.

Client-provided identifiers are never sufficient authorization by themselves.

## Secrets

Secrets remain server-side. Never ship harness/provider credentials to browser JavaScript, commit them, place them in prompts, return them from APIs, or log raw bearer/refresh tokens.

Publicly reachable harness ports must not be unauthenticated. Prefer restricted/private ingress plus the harness's own authentication.

## Durable state

Prefer harness-native state whenever it is authoritative for agent behavior: sessions, messages, runs, memory, approvals, tools, capabilities, or equivalent constructs.

Our database, when one is actually required, contains product-owned state such as identity, harness/runtime mapping, entitlements, billing references, and product preferences. Do not mirror harness runtime state just to create symmetry.

## Deployment and manual testing

Vercel is an acceptable consumer/product boundary. The harness runtime is separately hosted on infrastructure appropriate to the harness.

A deployment is not proof until the real browser -> product -> harness flow is exercised.

## Future channels

ChatGPT plugin / Apps SDK / MCP is V2+. It becomes another client of the same product/connector boundaries rather than defining V1 architecture.

## Source-of-truth hierarchy

When artifacts disagree:

1. observed behavior against the real deployed integration;
2. authoritative current upstream harness documentation;
3. `STATE.md`;
4. accepted current ADRs and this architecture document;
5. `ROADMAP.md` / `PROJECT.md`;
6. implementation plans;
7. older conversation history.
