# ADR 0003 — Upstream-First Hermes Consumer Layer

Status: Accepted for Hermes MVP; refined by ADR 0004

## Context

The original architecture assumed this repository needed a generic Harness Control Plane that owned task/session state, runtime routing, approvals, persistence, and multi-harness adapters.

Current official Hermes documentation shows that Hermes exposes supported HTTP surfaces for chat, asynchronous runs, session control, streaming, approvals, steering, stop, capabilities, skills/toolsets, and multi-user session-key scoping. Nous Portal/Hermes Cloud also provides hosted agent lifecycle management.

Building a parallel control plane would duplicate substantial upstream functionality before a consumer-product need had demonstrated the requirement.

## Decision

For the Hermes MVP, make the product a thin consumer distribution layer over Hermes/Nous.

V1 consumes supported Hermes APIs and Nous Portal/Hermes Cloud capabilities directly or through the smallest safe server-side mediation layer. Custom state and services are added only for observed consumer gaps such as onboarding, user-to-instance mapping, credential mediation, product entitlements, billing, or simplified UX.

Do not build a generic multi-harness control plane in V1.

ChatGPT plugin/Apps SDK/MCP integration is deferred to V2+ as a distribution channel rather than a product boundary.

## Refinement by ADR 0004

Hermes is the first harness, not the permanent product identity. ADR 0004 establishes the long-term harness-neutral consumer/account boundary and thin connector seam, with OpenClaw planned as the second harness.

This refinement does not reverse the upstream-first decision: authoritative runtime/session/memory/tool state remains in each harness rather than moving into a shared generic control plane.

## Consequences

- ADR 0001's shared generic Harness Control Plane decision is superseded.
- ADR 0002's principle of avoiding throwaway channel-specific business logic remains useful, but ChatGPT private/public convergence is no longer a current milestone.
- Hermes is intentionally a first-class upstream dependency for the MVP.
- Product-owned persistence should be minimal and should not mirror authoritative Hermes run/session/memory state without a concrete need.
- The first implementation milestone is an evidence-gathering real Hermes integration, not a bespoke backend scaffold.
- Cross-harness generalization waits for evidence from Hermes and OpenClaw rather than being designed in advance.

## Authoritative upstream references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
