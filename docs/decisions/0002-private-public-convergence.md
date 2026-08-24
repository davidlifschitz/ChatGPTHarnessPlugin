# ADR 0002 — Private and Published Paths Converge

Status: Accepted

## Context

The product needs a fast owner-only path for early testing and a production path for public ChatGPT distribution. If those are built as separate products, the private bridge becomes throwaway code and publication requires a rewrite.

## Decision

Treat private/canary and published/stable paths as deployment channels over one shared backend.

By M4 they must share runtime adapters, task/session services, persistence contracts, auth/tenant domain model, policy/approval logic, audit/usage model, tool/domain schemas, and automated tests.

Allowed differences include domains, client IDs, feature flags, rate limits, canary versions, and operator access.

## Consequences

- Private infrastructure may be simpler, but only behind production-shaped interfaces.
- A feature normally reaches the private channel before stable publication.
- No core capability is considered publish-ready if it exists only in a private client adapter.
