# ADR 0002 — Private and Published Paths Converge

Status: Partially superseded by ADR 0003

## Historical context

The original product plan assumed a private ChatGPT testing path and a public ChatGPT publication path over one shared custom backend.

## Principle retained

Do not create throwaway channel-specific business logic when a shared product boundary exists. Experimental clients may differ from production clients, but durable product-owned identity, entitlement, and credential-mediation logic should not be duplicated unnecessarily.

## Superseded portion

The specific ChatGPT private/public convergence milestones and the requirement for a product-owned task/session/runtime control plane are no longer active for V1.

ADR 0003 makes the V1 product an upstream-first consumer layer over Hermes/Nous and defers ChatGPT to V2+.