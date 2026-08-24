# Cloudflare Integration

Cloudflare is edge/transport infrastructure, not the agent control plane.

Useful roles may include:

- DNS and TLS,
- secure ingress to a private origin,
- Cloudflare Tunnel,
- WAF and rate limiting,
- origin protection.

The control plane remains responsible for user identity, tenant authorization, task/session state, runtime routing, approvals, and durable product logic.

## Portability rule

The platform must remain operable if Cloudflare is replaced by another edge/network provider. Application domain logic must not live inside tunnel or WAF configuration.
