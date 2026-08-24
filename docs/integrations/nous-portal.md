# Nous Portal / Hermes Cloud Integration

Nous Portal is an integration for Hermes Cloud account/org-aware discovery and lifecycle where supported.

## Boundary

Portal lifecycle operations should sit behind a dedicated adapter rather than define the whole product model.

Likely responsibilities include:

- user/org-aware Hermes Cloud discovery,
- create/start/stop/restart/destroy lifecycle operations where supported,
- status and cost metadata,
- official OAuth linkage.

Task/session execution may use a different Hermes runtime transport. Do not assume Portal lifecycle control is equivalent to conversational task delegation.

## Security

OAuth/access/refresh tokens stay server-side and never enter prompts, tool arguments, source control, or model-visible logs/results.
