# Hermes Consumer Layer — Verified Current State

Last verified: 2026-08-26

This file records verified reality, not intended future behavior.

## Current milestone

**M1 — Thin Consumer Path**

Status: **in progress**

## Verified upstream capabilities

From current official Hermes/Nous documentation:

- Hermes exposes an OpenAI-compatible HTTP API server.
- Hermes exposes REST session APIs for listing, creating, reading, updating, deleting, forking, reading messages, and running/streaming turns.
- Hermes exposes asynchronous run/control endpoints and a machine-readable capabilities endpoint.
- Hermes exposes stable `X-Hermes-Session-Key` scoping intended for multi-user frontends and long-term memory separation.
- Hermes documents compatibility with Open WebUI, LobeChat, LibreChat, NextChat, ChatBox, and other OpenAI-compatible clients.
- Nous Portal OAuth can configure Hermes model/tool access.
- Nous Portal MCP can list, create, start, stop, restart, update, and destroy Hermes Cloud instances within the authenticated Portal organization.

Authoritative references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal

## Verified repository reality

- `davidlifschitz/ChatGPTHarnessPlugin` is the current canonical repository.
- Before this product reset, the repository contained architecture/documentation but no application source tree.
- The old design assumed this product should own a generic harness control plane. That assumption is now superseded because substantial run/session/control functionality already exists upstream in Hermes.

## Not yet verified / not yet implemented

- A public consumer web experience.
- A deployed Open WebUI/LobeChat/custom frontend connected to the user's real Hermes Cloud instance.
- The exact public/private network endpoint and authentication mechanism available from the existing Hermes Cloud instance for the Hermes API server.
- Whether an off-the-shelf frontend satisfies the desired consumer UX without custom code.
- Consumer account-to-Hermes-instance provisioning/mapping.
- Production credential mediation for public users.
- Multi-user tenant isolation for this product layer.
- Billing, entitlements, analytics, rate limiting, or public onboarding.
- ChatGPT integration; it is intentionally deferred to V2+.

## Current critical path

1. Verify the real Hermes Cloud instance exposes or can expose the supported Hermes API server safely.
2. Connect one proven OpenAI-compatible frontend to that real instance.
3. Verify chat, streaming/tool progress, session resume, and per-user memory/session isolation.
4. Record exactly which consumer requirements remain unmet.
5. Build only the minimum custom product layer needed for those unmet requirements.
6. Harden and deploy the resulting web experience.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated Hermes do not prove an integration works. Update this file when behavior is observed against the actual upstream surface or verified in authoritative upstream documentation.