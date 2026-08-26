# ADR 0001 — Shared Harness Control Plane

Status: Superseded by ADR 0003

## Historical context

The original product concept assumed ChatGPT would be the primary client and that the product needed to normalize multiple agent harnesses behind one shared control plane.

That design assigned identity, tenant authorization, runtime routing, durable task/session state, policy/approvals, audit/usage metadata, and normalized errors to a product-owned backend.

## Supersession

ADR 0003 replaces this architecture for V1 after verification that current Hermes/Nous surfaces already provide substantial execution, run, session, approval, memory-scoping, and cloud-lifecycle functionality.

The general lesson that client-specific business logic should not be duplicated remains useful. The specific decision to build a generic Harness Control Plane is no longer active.