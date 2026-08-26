# Vercel Hermes M1 Test Surface

This is the smallest browser-facing surface for **M1 — Hermes Thin Consumer Path**. It is a validation client, not the final product frontend.

## Shape

```text
browser
  -> index.html
  -> /api/status or /api/chat
  -> server-only Hermes connector
  -> Hermes API server
```

The browser never receives the Hermes bearer credential or upstream base URL.

## Server-only configuration

Configure these only in the Vercel project environment:

- `HERMES_BASE_URL` — externally reachable HTTPS origin for the Hermes API server.
- `HERMES_API_KEY` — bearer credential matching the Hermes API server's `API_SERVER_KEY`.

Do not use `NEXT_PUBLIC_` or otherwise expose either value to browser code.

## Routes

- `GET /api/status` checks `/v1/capabilities` and `/v1/models`, returning only a connection flag, the advertised model ID, and the capabilities payload.
- `POST /api/chat` discovers the advertised model from `/v1/models`, then performs one non-streaming `POST /v1/chat/completions` turn.

The connector translates configuration, network, authentication, and upstream HTTP failures into secret-free errors. It does not persist sessions, runs, memory, tools, or model state.

## Current intentional limits

The first deployed slice does **not** yet provide:

- streaming/SSE;
- tool-progress events;
- explicit Hermes session create/resume controls;
- consumer authentication or multi-user authorization;
- public-user abuse/rate controls;
- product-owned persistence.

Those are added only after the real browser -> Vercel -> Hermes path works and testing shows which gaps belong to the product.

## Ingress blocker

Current Hermes documentation verifies that the API server is disabled by default, binds to `127.0.0.1` by default, uses port `8642`, and requires `API_SERVER_KEY`. Network access therefore requires an explicit reachable bind/ingress path. Hermes Cloud management documentation verifies that cloud instance environment variables can be updated, but does not by itself establish the user's instance's externally reachable API URL.

Do not invent `HERMES_BASE_URL`. Verify the actual Hermes Cloud ingress first.

## Deployment safety

Until consumer authentication exists, treat this as a private manual-test deployment. Prefer Vercel deployment protection before attaching a live Hermes credential. Do not expose a live tool-capable Hermes backend through an unrestricted public preview URL.

## Validation

Repository checks:

```bash
python -m unittest -v tests.test_hermes_probe
python -m py_compile tools/hermes_probe.py tests/test_hermes_probe.py
python tools/hermes_probe.py --help
node --test tests/web/*.test.js
node --check lib/hermes.js
node --check api/status.js
node --check api/chat.js
```

## Manual test once live Hermes ingress is configured

1. Open the protected Vercel deployment on a phone.
2. Confirm the status changes to `Connected` and displays the model advertised by Hermes.
3. Send `Reply with exactly: phone-test-ok`.
4. Confirm the response is exactly `phone-test-ok`.
5. Confirm the response appears all at once; streaming is not implemented in this slice.
6. Send one safe tool-using task and record what the UI exposes about progress.
7. Reload the page and record whether any conversation continuity exists; this slice does not intentionally implement resume yet.
8. Repeat from desktop.

Record observed behavior in `STATE.md`; do not infer real Hermes behavior from the local mock tests.
