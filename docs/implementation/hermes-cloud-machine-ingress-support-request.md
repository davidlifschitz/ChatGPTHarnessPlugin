# Hermes Cloud machine-ingress support request

Status: **Category D — blocked by the managed Hermes Cloud ingress boundary**

Date: 2026-08-26

This is a support-request draft. It contains no credentials, tokens, cookies, or
authorization codes.

## Request

Please provide one supported way for an external server-side consumer to reach
the Hermes API server of an existing Hermes Cloud agent without going through
the human-facing dashboard OAuth gate.

Preferred options, in order:

1. A dedicated machine API hostname or documented private/service endpoint for
   the existing agent.
2. A supported provider-managed tunnel or origin connector that can expose the
   API server through an external HTTPS hostname.
3. Documentation for enabling and reaching the managed API server, including
   whether a user-run origin process is permitted on the hosted instance.
4. A documented machine-authentication method that is accepted by the API
   server ingress and does not require copying a browser cookie or human OAuth
   session into the consumer service.

Please also confirm the managed instance's effective \`API_SERVER_ENABLED\`,
\`API_SERVER_HOST\`, and \`API_SERVER_PORT\` values, without requesting or
returning the value of \`API_SERVER_KEY\`.

## Observed facts

- Existing agent: \`Fair-dinkum Esky\`
- Agent ID: \`cmt642qt80005j90ab7o99n5h\`
- Portal/dashboard status: \`RUNNING / HEALTHY\`
- Dashboard status: API server connected
- Known public dashboard hostname:
  \`fair-dinkum-esky-8724.agents.nousresearch.com\`
- Using the existing API-server bearer credential from a server-side test,
  \`GET /v1/capabilities\`, \`GET /v1/models\`, and \`GET /api/sessions\` all return
  HTTP 503 with \`Auth provider 'nous' unreachable\`.
- Dashboard logs identify the upstream failure as JWT verification of the
  opaque API-server key, including \`DecodeError('Not enough segments')\`.
- The dashboard OAuth gate therefore runs before the Hermes API-server key
  check; the public dashboard hostname is not a usable API-server-key-only
  origin for this consumer.
- The authenticated Portal instance-configuration surface exposes status,
  size, image/version, recovery, Team Gateway, and scale-to-zero controls, but
  no API-server hostname, port, SSH access, shell access, or machine-ingress
  setting.
- The official API-server documentation describes a loopback default of
  \`127.0.0.1:8642\` with \`API_SERVER_KEY\` authentication. The official remote
  backend documentation describes user-run \`hermes serve\` or SSH backends; it
  does not document a direct machine API origin for managed Hermes Cloud
  agents.

## Consumer topology waiting on this answer

\`\`\`text
Vercel Preview
    -> secure machine-authenticated HTTPS origin
    -> Hermes API server
    -> Hermes runtime
\`\`\`

The Vercel consumer already sends \`Authorization: Bearer <API_SERVER_KEY>\`
server-side. The bridge can add Cloudflare Access service-authentication
headers if a supported origin is made available, but Cloudflare Tunnel cannot
be created safely until a process or provider mechanism can reach the actual
Hermes API server.

## Security constraints

- Do not request passwords, MFA codes, CAPTCHA answers, browser cookies, OAuth
  authorization codes, OAuth access tokens, refresh tokens, API keys, or
  private keys in a support reply.
- Do not ask the user to expose \`API_SERVER_KEY\`.
- Do not suggest using the public dashboard OAuth session as a machine API
  credential unless Nous documents that exact server-to-server contract.
