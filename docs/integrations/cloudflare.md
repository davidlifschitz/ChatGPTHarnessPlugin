# Cloudflare Integration

Cloudflare is optional edge/transport infrastructure, not the product's agent runtime or durable state owner.

Useful roles may include:

- DNS and TLS;
- secure ingress to a private Hermes or product origin;
- Cloudflare Tunnel;
- WAF and rate limiting;
- origin protection.

Hermes/Nous remains authoritative for agent execution and upstream session/run behavior. Any product-owned identity, entitlement, or credential-mediation logic should live in the minimal trusted application boundary rather than in tunnel or WAF configuration.

## Portability rule

The product should remain operable if Cloudflare is replaced by another edge/network provider. Do not make Cloudflare a prerequisite unless M1/M2 verifies a concrete networking requirement that needs it.