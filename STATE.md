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
- GitHub Actions workflow `M1 tests` passes on branch head `91cb70681b4fcbd9882010ac659f8fb913877eb6`.

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

## Verified Hermes Cloud blocker

- After the earlier `STOPPING` observation and `503: Auth provider 'nous' unreachable` error, the user manually checked the existing Hermes Cloud agent `Fair-dinkum Esky` in Nous Portal on 2026-08-26 and reported that it is **not running**.
- No new Hermes Cloud agent has been created, and no additional restart or resource mutation was performed in this verification pass.
- Because the existing agent is not running, the real read-only probe, explicit `probe-ok` turn, Vercel `/api/chat` verification, and manual phone/browser Hermes turn remain intentionally gated.

## Not yet verified / not yet implemented

- The exact current Hermes Cloud lifecycle enum/status beyond the user's observation that `Fair-dinkum Esky` is not running.
- Whether the previous upstream error `503: Auth provider 'nous' unreachable` is still the exact current Hermes provider error; the Vercel route currently exposes only the sanitized upstream HTTP status.
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

1. Resolve or obtain a healthy `RUNNING` state for the existing `Fair-dinkum Esky` Hermes Cloud agent through supported Nous/Hermes controls, without creating another agent or repeatedly restarting/mutating resources.
2. Once healthy, run the existing read-only probe against `/v1/capabilities`, `/v1/models`, and `/api/sessions`.
3. Run exactly one explicit real test turn after the read-only checks pass.
4. Verify the protected Vercel Preview `/api/status` and then one minimal `/api/chat` request.
5. Manually test the deployed flow from desktop and phone only after server-side checks pass.
6. Verify chat, streaming/tool progress, session resume, and per-user memory/session isolation.
7. Record exactly which consumer requirements remain unmet.
8. Build only the minimum shared product layer needed for those unmet requirements.
9. Ship the Hermes production web MVP before beginning the OpenClaw connector milestone.

## State-update rule

Plans, mocks, fake adapters, and tests against simulated harnesses do not prove an external integration works. Update this file when behavior is observed against an actual upstream surface or verified in authoritative upstream documentation.
