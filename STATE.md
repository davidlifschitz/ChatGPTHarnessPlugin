# ChatGPT Harness Plugin — Verified Current State

Last verified: 2026-09-30

This file records verified reality, not intended future behavior.

## Current milestone

**M1 — Plus Personal Plugin Proof**

Status: **not yet implemented**

## Verified OpenAI platform state

Current official OpenAI documentation verifies:

- ChatGPT developer mode provides full MCP support for read and write tools on Plus and Pro;
- a developer can add a deployed HTTPS `/mcp` endpoint as a personal plugin;
- plugins can contain skills, an MCP server, or both;
- ChatGPT and Codex share a universal plugin directory;
- public plugin submission/review exists;
- authenticated plugin MCP servers use the MCP OAuth 2.1 authorization model.

Authoritative references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

## Verified Sign in with ChatGPT state

OpenAI currently lists Hermes Agent among participating apps where eligible Plus/Pro users may choose to use ChatGPT plan usage for AI requests.

Reference:

- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

This is verified as an upstream product capability.

It is **not yet verified in this repository** as the authentication/model-provider path for the Hermes runtime we will use.

## Verified upstream Hermes capabilities

Current official Hermes documentation verifies:

- an OpenAI-compatible HTTP API server;
- `/v1/capabilities` and `/v1/models`;
- REST session APIs;
- synchronous and streamed session chat;
- asynchronous runs/control endpoints;
- skills/toolset discovery;
- stable `X-Hermes-Session-Key` scoping;
- bearer authentication via `API_SERVER_KEY`;
- API-server defaults of disabled, `127.0.0.1`, port `8642`, and a required key when enabled.

Authoritative references:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

## Verified Nous Portal MCP capability

Nous documents an OAuth/PKCE MCP server for managing Hermes Cloud instances.

Documented operations include:

- list/status/cost;
- create;
- start/stop/restart;
- destroy;
- update environment/image.

Reference:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

The documented Portal MCP surface does **not** establish a Hermes session/chat tool or direct per-instance Hermes API ingress.

Therefore the project still must verify a supported machine path from our MCP service to the actual Hermes runtime.

## Verified repository reality

- `davidlifschitz/ChatGPTHarnessPlugin` is the canonical repository.
- PR #4 merged on 2026-08-26 and established the upstream-first, multi-harness consumer-layer architecture.
- Hermes is the MVP harness; OpenClaw is planned second.
- The repository contains `tools/hermes_probe.py` for Hermes capabilities/model/session verification with opt-in chat.
- The repository contains a dependency-free Vercel diagnostic surface with server-only `/api/status` and `/api/chat` routes.
- Browser code is designed not to contain Hermes server credentials.
- The root `api/` directory currently contains `chat.js` and `status.js`; there is no implemented `/mcp` endpoint in the current main branch.
- The repository does not yet contain a public plugin package/manifest.

## Previous managed Hermes Cloud finding

The August 2026 investigation found that the tested human-facing managed Hermes Cloud dashboard hostname was not a usable `API_SERVER_KEY`-only machine origin. The public gate rejected the opaque API key before the request reached Hermes, and no separate supported machine origin was found in the tested surface.

That finding remains historical evidence about that tested ingress path.

It does not prove that all current/future Hermes Cloud machine-access paths are unavailable.

ADR 0005 therefore remains valid as an allowed fallback: run official Hermes on operator-controlled infrastructure when needed to obtain a secure machine API boundary.

## Architecture decision now proposed/recorded

ADR 0006 changes the primary consumer channel:

- ChatGPT plugin/MCP becomes V1 rather than V2+;
- Plus developer mode is the first private integration path;
- the standalone Vercel UI becomes diagnostics/admin/testing;
- public plugin submission follows only after the private Hermes path and user isolation are proven.

This changes the consumer surface and roadmap sequencing.

It does **not** replace the upstream-first harness model or ADR 0005's runtime-boundary decision.

## Not yet verified

- our own deployed streamable-HTTP `/mcp` endpoint;
- successful personal-plugin connection from the user's Plus account;
- one read tool call from ChatGPT to our MCP server;
- one controlled write/action tool call from ChatGPT to our MCP server;
- plugin -> MCP -> Hermes connectivity;
- successful real Hermes session chat through the plugin;
- a successful tool-capable Hermes task through the plugin;
- the final Hermes runtime host/origin;
- use of Sign in with ChatGPT inside the selected Hermes runtime;
- multi-user OAuth/isolation;
- public plugin package validation/submission/approval;
- intended mobile plugin behavior;
- OpenClaw integration;
- billing, entitlements, analytics, or public onboarding.

## Current critical path

1. Implement a minimal streamable-HTTP MCP endpoint at `/mcp`.
2. Deploy it to stable HTTPS.
3. Add it as a personal plugin in ChatGPT developer mode on Plus.
4. Prove one read tool and one controlled write/action tool.
5. Connect the MCP service to a real Hermes API server through a secure machine path.
6. Prove capabilities/sessions and one real Hermes turn.
7. Prove one tool-capable task and session continuity.
8. Add OAuth 2.1 and verify two-user isolation.
9. Package and submit the public plugin.
10. Add OpenClaw only after the Hermes plugin path is stable.

## State-update rule

Plans, mocks, fake adapters, simulated tests, and documentation claims do not prove an external integration works.

Update this file only when behavior is observed against a real surface or verified in authoritative current upstream documentation.
