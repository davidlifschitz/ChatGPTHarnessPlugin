# ADR 0001 — Shared Harness Control Plane

Status: Accepted

## Context

The product must support ChatGPT clients across private/canary and published/stable delivery paths while allowing different underlying agent harnesses.

Building separate backends for each client or harness would create duplicated auth, task, session, policy, and reliability logic and make publication a rewrite of private prototyping.

## Decision

Use one shared Harness Control Plane as the product backend.

ChatGPT surfaces are clients of that control plane. Harnesses such as Hermes, OpenClaw, and Pi integrate through adapters. Hosting/lifecycle systems such as Nous Portal are integrations behind adapter boundaries.

The control plane owns identity, tenant authorization, runtime routing, durable task/session state, policy/approvals, audit/usage metadata, and normalized errors.

## Consequences

- Private and public delivery paths must not contain independent business logic.
- Harness-specific APIs remain inside adapters.
- A second harness can be added without creating a second product backend.
- Private shortcuts are allowed only behind interfaces that can survive production auth/deployment changes.
