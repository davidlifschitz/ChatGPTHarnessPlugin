# ChatGPTHarnessPlugin — Verified Current State

Last verified: 2026-08-24

This file records project reality, not intended future behavior. Update it only when a fact has been verified in code, a live integration, or authoritative external documentation.

## Current milestone

**M1 — Hermes Runtime Adapter**

Status: **in progress**

## Verified working

- The dedicated public repository `davidlifschitz/ChatGPTHarnessPlugin` exists and is the canonical product repository.
- The repository has an initialized `main` branch.
- The project architecture is being organized around a shared Harness Control Plane and runtime adapters.
- Hermes is the first runtime integration target, not the product boundary.
- A separate Hermes source fork exists and must be treated as a dependency/runtime workspace rather than the canonical product repository.

## Not yet verified / not yet implemented

- A shared control-plane service implementation.
- A working Hermes runtime adapter.
- A working OpenClaw, Pi, or other secondary harness adapter.
- ChatGPT → MCP/app → shared control plane → Hermes end-to-end execution.
- Durable cross-request task/session persistence in this product.
- Production user authentication and tenant isolation.
- Production OAuth linkage to Nous Portal.
- Public ChatGPT app/plugin registration or publication.
- Mobile end-to-end use of the published product.
- Production deployment, rate limiting, observability, or billing.

## Known technical uncertainty

Older planning work for the Hermes-specific bridge assumed an existing `/v1/runs`-style API surface in a Hermes fork. That assumption must not be treated as implementation truth until the current Hermes remote-control surface is re-verified.

The runtime adapter should be based on supported, observed capabilities rather than invented endpoints or internal file names.

## Current critical path

1. Verify current Hermes remote-control/session behavior.
2. Verify what Nous Portal MCP covers for Hermes Cloud discovery/lifecycle versus conversational task execution.
3. Define and implement the minimal shared runtime-adapter contract.
4. Implement Hermes adapter #1.
5. Prove programmatic task execution and lifecycle behavior.
6. Put the private ChatGPT/MCP client over the same shared service boundary.

## State-update rule

Whenever a PR materially changes what is demonstrably working, blocked, or verified, update this file in the same PR. Plans, mocks, interfaces, and tests against fakes do not by themselves prove a live external integration works.
