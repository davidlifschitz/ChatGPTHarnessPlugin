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
- Branch `product-reset/thin-hermes-consumer-layer` defines the long-term product as a harness-neutral consumer layer rather than a Hermes-only product or generic control plane.
- Hermes is explicitly the MVP/first harness because it is currently the shortest path to a hosted real product.
- OpenClaw is explicitly the planned second harness; no OpenClaw runtime capability is yet recorded as verified by this repository.
- ADR 0004 defines a thin harness connector seam for transport/auth/capability/lifecycle differences while keeping authoritative runtime state upstream in each harness.
- The repository contains `tools/hermes_probe.py`, a standard-library HTTP probe for Hermes capabilities, model discovery, and sessions with explicitly opt-in chat execution.
- The current local unit suite passes 6 focused Python tests against a local HTTP server, covering bearer auth, credential redaction, advertised-model discovery, optional session-API handling, and explicit chat behavior.
- `python tools/hermes_probe.py --help` and Python bytecode compilation succeed in the local validation environment.
- The branch contains a dependency-free Vercel M1 browser test surface: a static mobile-friendly page, server-only `/api/status` and `/api/chat` routes, and a thin Hermes HTTP connector that discovers the advertised model instead of hardcoding it.
- The web test suite passes 10 Node tests covering server-only bearer auth, model discovery, API route behavior, configuration errors, and a guard that browser code contains no Hermes server configuration or bearer handling.
- GitHub Actions workflow `M1 tests` passes on commit `a6788c998a7b9c02611d2103fedcabae43b565b8`, running the existing Python checks plus the new Node web-surface tests and syntax checks.

## Verified Vercel manual-test deployment

- Vercel project `hermes-consumer-layer-m1` exists with deployment `dpl_Zy1Xb2bxSGgswJE61c15HDJpmWPA` in `READY` state.
- The deployment is reachable at `https://hermes-consumer-layer-m1.vercel.app/` and returns the M1 browser test page with HTTP 200.
- `GET /api/status` executes the serverless route and currently returns HTTP 503 with the expected explicit `Hermes is not configured` response because no live Hermes endpoint/key has been attached.
- The deployment build completed without build errors, and no Vercel runtime error cluster is currently reported for the project.
- The deployment is currently reachable without Vercel Authentication. Do not attach a live tool-capable Hermes credential until deployment protection or another equivalent access boundary is enabled.
- No Hermes credential or Hermes base URL is present in the browser HTML served by the deployment.

## Not yet verified / not yet implemented

- The exact public/private network endpoint and authentication mechanism available from the user's existing Hermes Cloud instance for the Hermes API server.
- Whether that Hermes Cloud instance currently has the API server enabled, bound to a reachable interface, and exposed through a stable HTTPS ingress.
- A successful run of `tools/hermes_probe.py` against the real Hermes Cloud instance.
- A real browser -> Vercel -> Hermes test turn.
- Streaming/tool progress through the browser test surface.
- Explicit session creation/resume from the browser test surface.
- Manual phone/desktop verification of a real Hermes-backed turn.
- Whether an off-the-shelf frontend satisfies the desired consumer UX without custom code.
- Consumer account-to-harness/agent provisioning/mapping.
- Production credential mediation for public users.
- Multi-user tenant isolation for this product layer.
- An OpenClaw connector or verified OpenClaw integration contract.
- Billing, entitlements, analytics, rate limiting, or public onboarding.
- ChatGPT integration; it is intentionally deferred to V2+.

## Current critical path

1. Enable an access boundary on the Vercel manual-test deployment before attaching any live Hermes credential.
2. Determine the real Hermes API-server URL/network path for the existing Hermes Cloud instance without exposing credentials.
3. Run the read-only Hermes probe against it.
4. Run one explicit real test turn after the read-only checks pass.
5. Configure server-only `HERMES_BASE_URL` and `HERMES_API_KEY` in Vercel and redeploy the manual-test surface.
6. Manually test the deployed flow from desktop and phone.
7. Verify chat, streaming/tool progress, session resume, and per-user memory/session isolation.
8. Record exactly which consumer requirements remain unmet.
9. Build only the minimum shared product layer needed for those unmet requirements.
10. Ship the Hermes production web MVP before beginning the OpenClaw connector milestone.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated harnesses do not prove an external integration works. Update this file when behavior is observed against an actual upstream surface or verified in authoritative upstream documentation.
