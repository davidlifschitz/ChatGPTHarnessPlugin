# Nous Portal integration

## Boundary

Nous Portal/Hermes Cloud lifecycle and Hermes task execution are separate channels.

The Hermes runtime adapter owns execution against a configured Hermes API server. It does not claim to list, create, start, stop, restart, destroy, or select cloud agents.

## Current evidence

The current official Hermes docs also document the Nous Portal MCP endpoint at `https://portal.nousresearch.com/mcp`. The supported setup is `hermes mcp add --url https://portal.nousresearch.com/mcp --auth oauth hermes-cloud`, followed by official browser OAuth/PKCE. The documented MCP lifecycle surface includes an `agents` listing/status/cost-estimate operation and an `agent` operation for start, stop, restart, create, destroy, environment, and image changes. Organization membership and the browser-selected org govern access.

This is verified as an official lifecycle interface, but it is not yet wired into the product adapter. No user-specific org/agent identifier is hard-coded. `hermes setup --portal` / `hermes portal` remain interactive local setup flows, and dashboard OAuth is a separate concern.

The private product MCP endpoint does not use Nous Portal lifecycle MCP. It calls only the already configured Hermes runtime through the Hermes adapter. This keeps task/session execution separate from Cloud agent discovery and provisioning; the latter remains unverified here and still requires an official browser authorization boundary when implemented.

## M1 behavior

- Accept an already authenticated, operator-configured runtime endpoint and API key through runtime configuration.
- Never request or persist passwords, MFA codes, OAuth codes/tokens, cookies, or private keys.
- Stop at the official browser authorization boundary if future lifecycle integration requires human OAuth.
- Keep lifecycle resolution separate from task execution; the current product implementation resolves only operator-configured local endpoints.
- Report Hermes Cloud discovery/provisioning and Cloud task execution as unverified until this repository adds authenticated MCP lifecycle integration and a real safe Cloud execution test.

Evidence: [Manage Hermes Cloud with MCP](https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp), [Nous Portal integration](https://hermes-agent.nousresearch.com/docs/integrations/nous-portal), and [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).
