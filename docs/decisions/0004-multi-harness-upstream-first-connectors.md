# ADR 0004 — Multi-Harness Product, Upstream-First Connectors

Status: Accepted; hosting assumptions refined by ADR 0005

## Context

ADR 0003 moved the product away from rebuilding Hermes as a generic control plane. Hermes is the first MVP harness, not the permanent product identity.

The long-term product lets consumers use capable general-purpose harnesses through one simple experience. OpenClaw is the planned second harness and will test whether the connector boundary is genuinely reusable.

The main architectural risks are coupling product code to one harness everywhere or rebuilding a generic runtime that duplicates the harnesses.

## Decision

Make the consumer/account boundary harness-neutral while keeping execution and native state upstream in each harness.

Introduce only a thin harness connector seam. A connector may own connection/authentication, endpoint/lifecycle discovery, capability discovery, transport, stable upstream references, and harness-specific diagnostics.

A connector does **not** own a parallel agent runtime, task engine, session database, memory system, tool orchestration system, or generic scheduler.

The consumer layer may own identity, onboarding, selected harness/runtime mapping, permissions/entitlements, billing references, and simplified UX.

## Hosting refinement

A harness connector is independent of the hosting vendor.

For M1, Hermes runs on operator-controlled infrastructure because that gives the product a secure machine API boundary while still using Hermes itself as the authoritative runtime. Managed harness hosting may replace that infrastructure later only when it exposes the required machine API/lifecycle/isolation contract.

## Sequencing

1. Hermes is the only harness required for MVP and the first production web release.
2. Prove one operator-controlled Hermes end-to-end user journey before broader lifecycle automation.
3. Do not delay Hermes to generalize for hypothetical harnesses.
4. Keep Hermes-specific transport behind the smallest practical connector boundary.
5. OpenClaw is the planned second harness after the Hermes web MVP.
6. Use OpenClaw to validate/revise the connector contract from evidence.
7. Add other harnesses only for concrete user value.

## Consequences

- The product can support multiple harnesses without making one harness or hosting vendor the product identity.
- Shared product state must not mirror authoritative runtime state merely for symmetry.
- Capability differences remain visible.
- Runtime infrastructure may differ by harness while the consumer/account experience remains shared.
- ChatGPT remains a future distribution channel independent of the execution harness.

## Planned harness sequence

- **MVP:** Hermes on product-operated runtime infrastructure; Nous Portal/provider services may be used upstream
- **Second harness:** OpenClaw
- **Later:** other harnesses only when product-driven
