# Nous Portal / Hermes Cloud Integration

Nous Portal is the upstream subscription, authentication, model/tool gateway, and Hermes Cloud management surface used by V1.

## Verified capabilities

Current official documentation verifies that Portal OAuth can configure Hermes model/tool access and that the Portal MCP server can operate against the authenticated user's organization.

The Portal MCP currently documents:

- list/get/status/cost-estimate for Hermes Cloud agents;
- create;
- start/stop/restart;
- destroy;
- update environment/image.

Membership is re-checked against the authenticated Portal organization for calls through that MCP surface.

## Product boundary

Use Portal/Hermes Cloud for hosting and lifecycle wherever the supported surface satisfies the product requirement.

Do not create an independent cloud scheduler or runtime-registry abstraction unless a verified consumer requirement cannot be expressed through upstream behavior.

Conversational execution remains a Hermes API-server concern; Portal lifecycle control and Hermes execution are related upstream surfaces, not one invented product API that we need to normalize prematurely.

## M1 question

We still need to verify how a Hermes Cloud instance exposes the Hermes API server to an external server-side frontend/proxy and which authentication/network controls are available on the existing deployment.

## Security

OAuth/access/refresh tokens and Hermes API keys stay server-side and never enter prompts, browser bundles, source control, or model-visible logs/results.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
