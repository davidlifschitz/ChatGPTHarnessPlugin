# Nous Portal / Hermes Cloud Integration

Nous Portal and Nous-managed Hermes Cloud are related but separate upstream products for this repository.

## Nous Portal role

Nous Portal may provide Hermes model/tool authentication and provider access. Current official Hermes documentation supports Portal-based setup for a Hermes runtime.

Portal/provider credentials remain upstream secrets and stay server-side.

## Managed Hermes Cloud role

Managed Hermes Cloud is an optional hosting/lifecycle product, not the required V1 runtime host.

The current authenticated Portal MCP/docs expose managed-agent lifecycle operations such as list/get/status/cost, create, start/stop/restart, destroy, and environment/image updates. These capabilities can be useful in future if the managed service also exposes a supported machine API ingress suitable for the consumer product.

## Verified M1 limitation

The managed instance tested during M1 exposed a public human-facing dashboard hostname whose Nous OAuth gate handled the Authorization header before Hermes' `API_SERVER_KEY` check. No separate supported machine API hostname or origin-side connector was found in the inspected surface.

Therefore managed Hermes Cloud is not the M1 critical path.

## Current M1 boundary

- Run Hermes on operator-controlled persistent infrastructure.
- Use Nous Portal inside Hermes for model/tool access when useful.
- Use Hermes' own API server as the execution interface.
- Keep hosting-provider details out of the consumer domain model.
- Revisit managed Hermes Cloud only if it gains a documented machine-authenticated ingress contract that simplifies operations.

## Security

OAuth/access/refresh tokens and Hermes API keys stay server-side and never enter prompts, browser bundles, source control, model-visible logs, issues, or PRs.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
