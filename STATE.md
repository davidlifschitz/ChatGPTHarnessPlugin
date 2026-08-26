# Harness Consumer Layer — Verified Current State

Last verified: 2026-08-26

This file records verified reality, not intended future behavior.

## Current milestone

**M1 — Hermes Thin Consumer Path**

Status: **in progress**

## Verified upstream Hermes capabilities

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
- Branch `product-reset/thin-hermes-consumer-layer` now defines the long-term product as a harness-neutral consumer layer rather than a Hermes-only product or generic control plane.
- Hermes is explicitly the MVP/first harness because it is currently the shortest path to a hosted real product.
- OpenClaw is explicitly the planned second harness; no OpenClaw runtime capability is yet recorded as verified by this repository.
- ADR 0004 defines a thin harness connector seam for transport/auth/capability/lifecycle differences while keeping authoritative runtime state upstream in each harness.
- The repository contains `tools/hermes_probe.py`, a standard-library HTTP probe for Hermes capabilities, model discovery, and sessions with explicitly opt-in chat execution.
- The current local unit suite passes 6 focused tests against a local HTTP server, covering bearer auth, credential redaction, advertised-model discovery, optional session-API handling, and explicit chat behavior.
- `python tools/hermes_probe.py --help` and Python bytecode compilation succeed in the local validation environment.
- Vercel is now documented as an acceptable manual-test deployment target for the consumer surface, provided harness secrets remain server-side. No Vercel deployment has been performed or verified in this repository yet.

## Not yet verified / not yet implemented

- A public consumer web experience.
- A Vercel-hosted manual-test build for the current M1 flow.
- A deployed Open WebUI/LobeChat/custom frontend connected to the user's real Hermes Cloud instance.
- The exact public/private network endpoint and authentication mechanism available from the existing Hermes Cloud instance for the Hermes API server.
- A successful run of `tools/hermes_probe.py` against that real Hermes Cloud instance.
- Whether an off-the-shelf frontend satisfies the desired consumer UX without custom code.
- Consumer account-to-harness/agent provisioning/mapping.
- Production credential mediation for public users.
- Multi-user tenant isolation for this product layer.
- An OpenClaw connector or verified OpenClaw integration contract.
- Billing, entitlements, analytics, rate limiting, or public onboarding.
- ChatGPT integration; it is intentionally deferred to V2+.

## Current critical path

1. Determine the real Hermes API-server URL/network path for the existing Hermes Cloud instance without exposing credentials.
2. Run the read-only Hermes probe against it.
3. Run one explicit real test turn after the read-only checks pass.
4. Deploy/connect a browser test surface, using Vercel where useful, through a safe server-side connection.
5. Manually test the deployed flow from desktop and phone.
6. Verify chat, streaming/tool progress, session resume, and per-user memory/session isolation.
7. Record exactly which consumer requirements remain unmet.
8. Build only the minimum shared product layer needed for those unmet requirements.
9. Ship the Hermes production web MVP before beginning the OpenClaw connector milestone.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated harnesses do not prove an external integration works. Update this file when behavior is observed against an actual upstream surface or verified in authoritative upstream documentation.
