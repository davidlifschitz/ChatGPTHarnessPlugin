# Nous Portal / Hermes Cloud Integration

Nous Portal and Nous-managed Hermes Cloud are related but separate upstream products for this repository.

## Nous Portal role

Nous Portal may provide Hermes model/tool authentication and provider access. Current official Hermes documentation supports Portal-based setup for a Hermes runtime.

Portal/provider credentials remain upstream secrets and stay server-side.

## Managed Hermes Cloud MCP role

Nous documents an OAuth/PKCE MCP server for Hermes Cloud lifecycle management.

Documented operations include:

- list/get/status/cost;
- create;
- start/stop/restart;
- destroy;
- update environment/image.

Reference:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

These lifecycle tools may be useful behind our product later.

They are not documented as a replacement for Hermes' own per-session chat/run API.

## Verified historical ingress limitation

The managed instance tested in August 2026 exposed a public human-facing dashboard hostname whose Nous OAuth gate handled the Authorization header before Hermes' `API_SERVER_KEY` check. No separate supported machine API hostname or origin-side connector was found in the inspected surface.

Therefore that tested dashboard hostname is not the assumed M2 session/chat origin.

This is historical evidence about that path, not a claim that all present/future Hermes Cloud machine ingress is unavailable.

## Current boundary

- ChatGPT calls our public MCP service.
- Our MCP service must reach a supported Hermes API server origin.
- Nous Portal may supply model/tool/provider authentication inside Hermes.
- Nous Portal MCP may manage cloud lifecycle when useful.
- If managed Cloud does not expose the needed Hermes API origin, run Hermes on operator-controlled persistent infrastructure under ADR 0005.
- Keep hosting-provider details out of the user-facing plugin model.

## Sign in with ChatGPT

OpenAI currently lists Hermes Agent as a participating app for eligible Plus/Pro ChatGPT plan usage:

- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

This may simplify model usage/auth inside Hermes, but it does not by itself establish network transport from our plugin MCP service into a Hermes runtime.

## Security

OAuth/access/refresh tokens and Hermes API keys stay server-side and never enter plugin packages, prompts, browser bundles, source control, model-visible logs, issues, or PRs.

## Authoritative references

- https://hermes-agent.nousresearch.com/docs/integrations/nous-portal
- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp
- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt
