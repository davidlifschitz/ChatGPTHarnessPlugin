# Hermes Integration

Hermes is the first runtime adapter target.

## Product role

Hermes provides general-purpose agent execution/orchestration. ChatGPT-facing code must not depend directly on Hermes internal Python classes, CLI file layout, or undocumented endpoints.

## Adapter goals

The Hermes adapter should expose only capabilities verified against the current runtime, such as health, task/run start, status, result, session continuation, approval, and cancellation/stop where actually supported.

Unsupported capabilities return `UNSUPPORTED_CAPABILITY` or another normalized product error.

## Current uncertainty

Older bridge planning assumed a `/v1/runs`-style Hermes API surface. Re-verify the current supported remote-control/session transport before implementation. Do not treat that older assumption as fact.

## Source fork

Any Hermes source fork is a dependency/runtime workspace, not this product's canonical repository. Modify the fork only when a concrete upstream/runtime change is required.
