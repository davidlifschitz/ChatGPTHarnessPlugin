# Published / Stable Path

Purpose: deliver the shared Harness Control Plane as an installable ChatGPT app/plugin for normal users.

## Requirements

- production authentication,
- tenant isolation,
- production OAuth/account linkage where required,
- stable MCP/Apps SDK contracts,
- user-facing onboarding and error states,
- rate limits and abuse controls,
- safe confirmations/approvals,
- privacy and retention documentation,
- production observability,
- reliable deployment and rollback.

## Architecture rule

The published client remains thin. It must use the same backend, adapters, task/session engine, and policy model proven through the private/canary path.

## First published harness

Hermes is the first planned published harness integration. Additional harnesses follow only after the shared architecture has been proven and they provide meaningful incremental value.
