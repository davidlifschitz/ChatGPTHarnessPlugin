# OpenClaw Integration — Planned Second Harness

Status: **planned / unverified**

OpenClaw is the planned second harness after the Hermes production web MVP.

This document intentionally does not claim any current OpenClaw runtime/API capability as fact. The OpenClaw milestone must begin by researching current authoritative upstream documentation and verifying behavior against a real deployment.

## Product role

OpenClaw should plug into the same consumer/account product through the thin harness connector seam defined by ADR 0004.

The product should reuse OpenClaw-native behavior rather than reproduce it. The connector exists only to isolate transport/auth/capability/lifecycle differences from consumer-facing product code.

## Questions to verify before implementation

- What supported remote/programmatic interface should a consumer product use?
- What authentication and secret boundary does that interface require?
- How are conversations/sessions/runs represented and persisted?
- What streaming/event/control mechanisms exist?
- How are tools, browser/computer use, approvals, and long-running work represented?
- What hosted deployment options are appropriate for frictionless consumer provisioning?
- What user/account isolation primitives are supported?
- Which capabilities overlap with Hermes and which are materially different?

## Implementation rule

Do not force OpenClaw into Hermes API names or semantics.

After verification:

1. implement the smallest connector required by the existing consumer product;
2. keep authoritative OpenClaw runtime state upstream;
3. adapt the UI based on advertised/verified capabilities;
4. revise the shared connector seam only where both real implementations justify it.

## Gate

OpenClaw integration is not started until the Hermes production web MVP milestone is complete, unless a concrete Hermes blocker makes OpenClaw necessary earlier.
