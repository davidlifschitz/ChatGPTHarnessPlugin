# ADR 0004 — Multi-Harness Product, Upstream-First Connectors

Status: Accepted

## Context

ADR 0003 correctly moved the product away from rebuilding Hermes as a generic control plane. However, Hermes is the first MVP harness, not the permanent product identity.

The long-term product should let a consumer use capable general-purpose agent harnesses through one simple experience. Hermes is first because its hosted infrastructure and supported APIs make it the fastest path to a real MVP. OpenClaw is the planned second harness and should be used to prove whether the connector boundary is genuinely reusable.

The main architectural risk is overcorrecting in either direction:

- coupling the consumer product directly to Hermes everywhere would make the second harness a rewrite;
- rebuilding a generic task/session/runtime platform would duplicate the harnesses themselves.

## Decision

Make the consumer/account product boundary harness-neutral while keeping execution state upstream in each harness.

Introduce only a thin harness connector seam. A connector may own:

- connection/authentication details;
- endpoint and lifecycle discovery;
- capability discovery and translation;
- request/stream transport;
- mapping stable upstream identifiers into consumer-facing references where required;
- harness-specific error translation and diagnostics.

A connector does **not** own a parallel agent runtime, task engine, session database, memory system, tool orchestration system, or generic scheduler.

The consumer layer may own shared product concerns such as identity, onboarding, selected harness/agent connection, permissions/entitlements, billing references, and simplified UX.

## Sequencing

1. Hermes is the only harness required for the MVP and first production web release.
2. Do not delay the Hermes MVP to generalize for hypothetical harnesses.
3. Keep Hermes-specific APIs behind the smallest practical connector boundary when product code is introduced.
4. OpenClaw is the planned second harness after the Hermes web MVP is working.
5. Use the OpenClaw implementation to validate or revise the connector contract from evidence rather than abstraction aesthetics.
6. Additional harnesses are added only when they provide concrete user value.

## Consequences

- The product can eventually support multiple harnesses without treating any one harness as the product identity.
- Hermes remains a first-class upstream dependency for MVP work.
- Shared product state must not mirror authoritative runtime state merely to create cross-harness symmetry.
- Capability differences remain visible; the UI should degrade or adapt rather than pretend every harness supports identical behavior.
- ADR 0003 remains valid for the upstream-first principle but is narrowed by this ADR where it described Hermes as the long-term product boundary.
- ChatGPT remains a future distribution channel and is independent of which harness executes the work.

## Planned harness sequence

- **MVP:** Hermes / Nous Portal / Hermes Cloud
- **Second harness:** OpenClaw
- **Later:** other harnesses only when there is a product-driven reason
