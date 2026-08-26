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
- GitHub Actions workflow `M1 tests` passes on the prior branch head `91cb70681b4fcbd9882010ac659f8fb913877eb6`; the reconciled branch head requires a fresh run after the evidence update.

## Verified Vercel manual-test deployment

- Vercel project `hermes-consumer-layer-m1` exists.
- Its first deployment, `dpl_Zy1Xb2bxSGgswJE61c15HDJpmWPA`, is `READY` and serves the production alias `https://hermes-consumer-layer-m1.vercel.app/`. Production remains intentionally unconfigured for Hermes.
- The production alias previously returned the M1 browser test page with HTTP 200; `GET /api/status` returned the expected explicit `Hermes is not configured` response when no live Hermes endpoint/key was attached there.
- A dedicated non-production manual-test deployment, `dpl_26LFhz5VrmpgJWtWQQFz94YjiqRF`, remains `READY` with no production alias.
- A newer redeployed non-production preview, `dpl_9FvYEtyQKyCGVjMvQMzRkupEvFGT`, is `READY` at `https://hermes-consumer-layer-m1-d69ckswcv-davidlifschitzs-projects.vercel.app/` and has no production alias.
- Vercel Authentication / Deployment Protection is now observed on that preview: an unauthenticated request to `/api/status` is redirected to Vercel SSO instead of reaching the application.
- Runtime logs for `dpl_9FvYEtyQKyCGVjMvQMzRkupEvFGT` show three executed `GET /api/status` requests at 2026-08-26 16:06 UTC, all returning HTTP 503 from the serverless route.
- No runtime error cluster is reported for `/api/status`; the current application intentionally sanitizes upstream HTTP failures and therefore the Vercel logs do not prove the exact upstream 503 body.
- The latest observed status result is therefore still blocked at the Hermes/upstream health boundary. A successful Hermes connection has not yet been observed from Vercel.
- No Hermes credential or Hermes base URL is present in browser-served HTML.

## Historical Hermes Cloud blocker

- An earlier verification pass recorded `Fair-dinkum Esky` as not running; that observation is superseded by the fresh live verification below.

## Fresh live M1 debugging evidence

- The existing Hermes Cloud agent `Fair-dinkum Esky` (`cmt642qt80005j90ab7o99n5h`) is freshly verified through the authenticated Portal/dashboard as `RUNNING` and `HEALTHY`; the dashboard reports the API server as connected. No additional agent was created.
- The known first-party dashboard/API origin is `https://fair-dinkum-esky-8724.agents.nousresearch.com`. Using the current server-side API key, direct read-only requests to `/v1/capabilities`, `/v1/models`, and `/api/sessions` all return HTTP 503 with `Auth provider 'nous' unreachable`.
- The authenticated Hermes dashboard log identifies the auth failure as the public-bind Nous dashboard gate attempting JWT verification of the opaque API-server key: `JWKS lookup failed: DecodeError('Not enough segments')`. This occurs before the API-server's local `API_SERVER_KEY` comparison, so the cloud dashboard origin is not a usable external API origin for the current bridge credential by itself.
- The selected `stealth/ox-alpha` model's free period ended; the active session successfully switched to `meituan/longcat-2.0:free`. This is a separate model-availability issue and is not evidence that the bridge path works.
- Direct-origin discovery found no separate API hostname, private/service hostname, exposed API port, or first-party machine-authenticated route in the current Portal/dashboard surface. The API server's live `API_SERVER_ENABLED`, `API_SERVER_HOST`, and `API_SERVER_PORT` values remain unexposed by the managed Cloud UI; documented defaults are not treated as live facts.
- Cloudflare preflight: `cloudflared` 2026.3.0 is installed and the account has unrelated existing tunnels, but no Hermes-specific tunnel or origin-side connector is present. `wrangler whoami` reports that its auth token is expired and cannot be refreshed non-interactively. No tunnel, DNS route, Worker, Access policy, or Cloudflare credential was created.
- The Vercel Preview deployment remains protected and `READY`, but its server-side `/api/status` still returns HTTP 503 because its configured dashboard origin is subject to the same upstream OAuth gate. Production remains intentionally unconfigured.
- No tunnel or Cloudflare resource will be created until a supported origin-side process or Nous mechanism is proven able to reach the managed Hermes API server directly.

## Not yet verified / not yet implemented

- A supported external Hermes API origin/authentication mechanism for the existing Hermes Cloud instance. The public dashboard URL is currently OAuth-gated ahead of the API-server key check.
- An origin-side process or supported Nous mechanism that can reach the managed Hermes API server directly, which is required before a Cloudflare Tunnel can be created safely.
- The live `API_SERVER_ENABLED`, `API_SERVER_HOST`, and `API_SERVER_PORT` values for the managed instance; the current Portal/dashboard surface does not expose them.
- A successful run of `tools/hermes_probe.py` against the real Hermes Cloud instance.
- Successful reads of `/v1/capabilities`, `/v1/models`, and `/api/sessions` against the real instance in this M1 verification pass.
- One explicit real Hermes test turn returning `probe-ok`.
- A successful protected-preview `/api/status` response.
- A successful protected-preview `/api/chat` request.
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

1. Determine whether Nous/Hermes Cloud exposes a supported direct machine API origin or origin-side execution path for the existing `Fair-dinkum Esky` agent.
2. If and only if the origin-side API server can be reached directly, establish the smallest secure external machine ingress; otherwise classify the managed Cloud boundary as blocked and prepare a support escalation.
3. Once a direct machine ingress exists, run the existing read-only probe against `/v1/capabilities`, `/v1/models`, and `/api/sessions`.
4. Run exactly one explicit real test turn after the read-only checks pass.
5. Verify the protected Vercel Preview `/api/status` and then one minimal `/api/chat` request.
6. Manually test the deployed flow from desktop and phone only after server-side checks pass.
7. Record exactly which consumer requirements remain unmet, then build only the minimum shared product layer needed for those unmet requirements.
8. Ship the Hermes production web MVP before beginning the OpenClaw connector milestone.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated harnesses do not prove an external integration works. Update this file when behavior is observed against an actual upstream surface or verified in authoritative upstream documentation.
