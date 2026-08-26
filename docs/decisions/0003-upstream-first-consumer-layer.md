# ADR 0003 — Upstream-First Hermes Consumer Layer

Status: Accepted for Hermes MVP; refined by ADR 0004 and ADR 0005

## Context

The original architecture assumed this repository needed a generic Harness Control Plane that owned task/session state, runtime routing, approvals, persistence, and multi-harness adapters.

Hermes already exposes supported HTTP surfaces for chat, runs, sessions, streaming, approvals/control, capabilities, skills/toolsets, and memory scoping. Rebuilding those systems would duplicate upstream behavior before a consumer need demonstrated the requirement.

## Decision

For the Hermes MVP, make the product a thin consumer distribution layer over Hermes.

V1 consumes supported Hermes APIs directly or through the smallest safe server-side mediation. Custom state/services are added only for observed consumer gaps such as onboarding, mapping, credential mediation, entitlements, billing, lifecycle automation, or simplified UX.

Do not build a generic multi-harness control plane in V1.

ChatGPT plugin/Apps SDK/MCP is V2+ distribution work rather than the product boundary.

## Refinement by ADR 0004

Hermes is the first harness, not the permanent product identity. ADR 0004 establishes the harness-neutral consumer/account boundary and thin connector seam, with OpenClaw planned second.

## Refinement by ADR 0005

"Upstream-first" refers to harness software and runtime semantics, not to a required hosting vendor. M1 may and currently should run official Hermes on product-operated infrastructure when that is necessary to obtain a secure supported machine API boundary.

Nous Portal may remain an upstream provider/model/tool integration. Nous-managed Hermes Cloud is no longer required for M1 hosting.

## Consequences

- ADR 0001's shared generic Harness Control Plane is superseded.
- Product-owned persistence remains minimal and must not mirror authoritative Hermes runtime state without a concrete need.
- Product-operated VM/container/network infrastructure is allowed when required to operate Hermes safely.
- Operating infrastructure does not transfer ownership of sessions, memory, tools, runs, or model routing away from Hermes.
- The first integration milestone is a real user journey, not a bespoke agent backend and not a specific vendor-cloud integration.
- Cross-harness generalization waits for Hermes and OpenClaw evidence.

## Authoritative upstream references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
