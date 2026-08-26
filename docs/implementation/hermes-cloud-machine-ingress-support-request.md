# Hermes Cloud machine-ingress support request

Status: **Optional follow-up — no longer an M1 blocker**

Date: 2026-08-26

This secret-free support draft records the managed Hermes Cloud ingress limitation observed during M1. ADR 0005 moved the M1 critical path to an operator-controlled Hermes runtime, so the product no longer waits for a response.

## Optional request to Nous

Please provide one supported way for an external server-side consumer to reach the Hermes API server of an existing managed Hermes Cloud agent without going through the human-facing dashboard OAuth gate.

Useful supported options would include:

1. a dedicated machine API hostname or documented private/service endpoint;
2. a provider-managed tunnel/origin connector;
3. documentation for reaching the managed API server from an external backend;
4. a documented machine-authentication method accepted before the dashboard OAuth layer.

Please also clarify whether managed instances expose effective `API_SERVER_ENABLED`, `API_SERVER_HOST`, and `API_SERVER_PORT` values to customers without exposing `API_SERVER_KEY`.

## Observed facts

- The tested existing agent was `RUNNING / HEALTHY` and reported its API server connected.
- Server-side reads to `/v1/capabilities`, `/v1/models`, and `/api/sessions` through the public dashboard hostname returned HTTP 503.
- Dashboard logs identified JWT verification of the opaque API-server key before Hermes received it, including `DecodeError('Not enough segments')`.
- The inspected Portal surface did not expose a separate machine API hostname, port, SSH/shell access, or origin connector.
- A Cloudflare Tunnel was not provisioned because no origin-side path existed to the actual Hermes API server.

## Product topology now used instead

```text
Vercel consumer surface
    -> restricted machine HTTPS ingress
    -> operator-controlled Hermes API server
    -> Hermes runtime
```

Nous Portal may still supply model/tool authentication inside Hermes.

## Security constraints

- Do not request passwords, MFA codes, CAPTCHA answers, browser cookies, OAuth authorization codes/tokens, API keys, or private keys in a support reply.
- Do not ask the user to expose `API_SERVER_KEY`.
- Do not recommend copying a human dashboard session into the consumer service unless Nous explicitly documents that exact server-to-server contract.
