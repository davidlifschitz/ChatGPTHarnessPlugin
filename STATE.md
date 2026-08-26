# Harness Consumer Layer — Verified Current State

Last verified: 2026-08-26

This file records verified reality, not intended future behavior.

## Current milestone

**M1 — Hermes Controlled-Runtime End-to-End**

Status: **in progress**

## Verified upstream Hermes capabilities

Current official Hermes documentation verifies:

- an OpenAI-compatible HTTP API server;
- `/v1/capabilities` and `/v1/models`;
- REST session APIs;
- asynchronous runs/control endpoints;
- skills/toolset discovery;
- stable `X-Hermes-Session-Key` scoping;
- bearer authentication via `API_SERVER_KEY`;
- Docker deployment with persistent host state;
- API-server defaults of disabled, `127.0.0.1`, port `8642`, and a required key when enabled;
- configurable network binding, including `0.0.0.0` when deliberately exposing the API beyond loopback;
- Nous Portal setup for model/tool access.

Authoritative references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration
- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal

## Verified repository reality

- `davidlifschitz/ChatGPTHarnessPlugin` is the canonical repository name.
- Branch `product-reset/thin-hermes-consumer-layer` defines a harness-neutral consumer layer.
- Hermes is the MVP harness; OpenClaw is planned second.
- The repository contains `tools/hermes_probe.py` for read-only Hermes capabilities/model/session verification with opt-in chat.
- The existing Python unit suite has a recorded 6/6 passing baseline.
- The existing Node web suite has a recorded 10/10 passing baseline.
- The branch contains a dependency-free Vercel M1 test surface with server-only `/api/status` and `/api/chat` routes.
- Browser code is designed not to contain Hermes server credentials.

## Verified managed Hermes Cloud findings

The managed Cloud investigation produced useful negative evidence but is no longer the M1 critical path.

- Existing agent `Fair-dinkum Esky` was verified `RUNNING / HEALTHY`; its dashboard reported the API server connected.
- Direct reads through its known public dashboard hostname to `/v1/capabilities`, `/v1/models`, and `/api/sessions` returned HTTP 503.
- Dashboard logs showed the human-facing Nous OAuth gate attempting JWT verification of the opaque API-server key before the request reached Hermes, including `DecodeError('Not enough segments')`.
- No separate supported machine API hostname, private service route, exposed API port, SSH access, shell access, or origin connector was found in the authenticated managed-Cloud surface used during that investigation.
- A Cloudflare Tunnel could not solve that managed instance because no origin-side process/path was available to reach the private Hermes API server directly.
- No replacement agent, tunnel, DNS route, Worker, Access policy, key rotation, production credential, real model turn, or PR merge was performed during that investigation.

Conclusion: **the public managed Hermes Cloud dashboard is not a usable `API_SERVER_KEY`-only machine origin for M1 under the observed contract.** This is a hosting-product limitation, not evidence against Hermes as the harness.

The support escalation draft remains at `docs/implementation/hermes-cloud-machine-ingress-support-request.md` as historical/optional follow-up. M1 no longer waits for it.

## Verified Vercel state

- Vercel project `hermes-consumer-layer-m1` exists.
- Preview Deployment Protection / Vercel Authentication was observed on the non-production test deployment.
- Preview `/api/status` returned HTTP 503 while pointed at the managed Hermes Cloud dashboard origin.
- Production remained intentionally unconfigured for Hermes.
- The current Vercel surface has not yet completed a real Hermes-backed turn.

## Architecture decision now recorded

ADR 0005 changes the M1 hosting assumption:

- upstream-first means reuse Hermes software/semantics, not require Nous-managed hosting;
- M1 will run Hermes on operator-controlled infrastructure with secure machine ingress;
- Nous Portal may still supply model/tool authentication;
- managed Hermes Cloud becomes optional and can be revisited if it gains a supported machine-ingress contract.

This decision is architecture/planning, not proof that the new runtime path already works.

## Not yet verified

- the selected operator-controlled cloud host;
- a deployed persistent Hermes runtime on that host;
- direct external machine access to that Hermes API server;
- successful real reads of `/v1/capabilities`, `/v1/models`, and `/api/sessions` on the new runtime;
- a successful real `probe-ok` turn;
- a successful protected Vercel `/api/status` against the new runtime;
- a successful Vercel `/api/chat` request;
- session continuity/restart persistence on the hosted runtime;
- a tool-capable end-to-end task;
- manual phone/desktop Hermes-backed verification;
- multi-user isolation/provisioning;
- OpenClaw integration;
- billing, entitlements, analytics, public onboarding, or ChatGPT distribution.

## Current critical path

1. Select the smallest practical operator-controlled VM/container host for one persistent Hermes runtime.
2. Deploy the official Hermes runtime with persistent Hermes-native data.
3. Configure provider/model/tool access through supported Hermes mechanisms (Nous Portal may be used).
4. Enable the authenticated Hermes API server and place it behind restricted machine-to-machine HTTPS ingress.
5. Run the existing read-only probe against `/v1/capabilities`, `/v1/models`, and `/api/sessions`.
6. Run exactly one minimal real turn after read-only checks pass.
7. Point the protected Vercel Preview to the new origin; verify `/api/status` and one `/api/chat` request.
8. Verify a tool-capable task, session continuity, restart persistence, and manual phone/desktop use.
9. Record the consumer gaps M1 actually exposes and build only those in M2.

## State-update rule

Plans, mocks, fake adapters, and simulated tests do not prove an external integration works. Update this file only when behavior is observed against a real surface or verified in authoritative upstream documentation.
