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
- Hermes exposes `/v1/models`; its advertised model ID defaults to the active profile name, or `hermes-agent` for the default profile.
- Hermes exposes stable `X-Hermes-Session-Key` scoping intended for multi-user frontends and long-term memory separation.
- Hermes documents compatibility with Open WebUI, LobeChat, LibreChat, NextChat, ChatBox, and other OpenAI-compatible clients.
- The API server defaults to disabled; its default bind when enabled is `127.0.0.1:8642`, and `API_SERVER_KEY` is required.
- Nous Portal OAuth can configure Hermes model/tool access.
- Nous Portal MCP can list, create, start, stop, restart, update, and destroy Hermes Cloud instances within the authenticated Portal organization.

Authoritative references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/user-guide/docker
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal

## Verified repository reality

- `davidlifschitz/ChatGPTHarnessPlugin` is the current canonical repository name.
- The product architecture on branch `product-reset/thin-hermes-consumer-layer` has been reset to an upstream-first Hermes consumer layer and the old generic control-plane ADR is superseded there.
- The repository contains `tools/hermes_probe.py`, a standard-library HTTP probe for Hermes capabilities, model discovery, and sessions with explicitly opt-in chat execution.
- The current local unit suite passes 6 focused tests against a local HTTP server, covering bearer auth, credential redaction, advertised-model discovery, optional session-API handling, and explicit chat behavior.
- `python tools/hermes_probe.py --help` and Python bytecode compilation succeed in the local validation environment.

## Not yet verified / not yet implemented

- A public consumer web experience.
- A deployed Open WebUI/LobeChat/custom frontend connected to the user's real Hermes Cloud instance.
- The exact public/private network endpoint and authentication mechanism available from the existing Hermes Cloud instance for the Hermes API server.
- A successful run of `tools/hermes_probe.py` against that real Hermes Cloud instance.
- Whether an off-the-shelf frontend satisfies the desired consumer UX without custom code.
- Consumer account-to-Hermes-instance provisioning/mapping.
- Production credential mediation for public users.
- Multi-user tenant isolation for this product layer.
- Billing, entitlements, analytics, rate limiting, or public onboarding.
- ChatGPT integration; it is intentionally deferred to V2+.

## Current critical path

1. Determine the real Hermes API-server URL/network path for the existing Hermes Cloud instance without exposing credentials.
2. Run the read-only Hermes probe against it.
3. Run one explicit real test turn after the read-only checks pass.
4. Connect one proven OpenAI-compatible frontend to that real instance through a safe server-side connection.
5. Verify chat, streaming/tool progress, session resume, and per-user memory/session isolation.
6. Record exactly which consumer requirements remain unmet.
7. Build only the minimum custom product layer needed for those unmet requirements.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated Hermes do not prove an external integration works. Update this file when behavior is observed against the actual upstream surface or verified in authoritative upstream documentation.