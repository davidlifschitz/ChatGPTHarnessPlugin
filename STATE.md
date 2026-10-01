# ChatGPT Harness Plugin — Verified Current State

Last verified: 2026-10-01

This file records verified reality, not intended future behavior.

## Current milestone

**M1 — Plus Personal Plugin Proof**

Status: **implementation and automated protocol verification complete; public Vercel ingress and ChatGPT manual acceptance still pending**

M1 is **not green** yet.

## Verified M1 implementation state

PR #6 merged on 2026-10-01 and established the plugin-first roadmap.

PR #7 (`m1/personal-plugin-proof`) now contains the narrow M1 implementation:

- Node is constrained to `22.x` in `package.json`;
- the current split MCP TypeScript SDK packages are pinned;
- `/mcp` rewrites to the Vercel function at `/api/mcp`;
- `get_m1_status` is the only read-only M1 tool;
- `run_m1_canary_action` is the only action tool;
- the action tool's only side effect is a sanitized server log entry containing its generated receipt ID and label length;
- neither M1 tool calls Hermes, reads user data, reads environment variables, accesses files/accounts/email, or invokes an external service;
- the existing Hermes diagnostic code remains separate and unchanged.

Verified CI evidence for commit `10c4e6c63fdb2bafe1148315b5a3844e942964f7`:

- GitHub Actions run `36823692416` completed successfully;
- the six Python Hermes-probe tests passed;
- Node ran as `v22.23.3`;
- `npm test` passed 18/18 JavaScript tests, including all MCP protocol/schema/annotation/error/secret-leakage tests;
- `npm run check` passed.

Verified deployment evidence for the same commit:

- Vercel deployment `dpl_6Qk7v9kd6SGbZQAvKdULcWe4x7uT` reached `READY`;
- deployment URL: `https://hermes-consumer-layer-m1-nkv17rxsn-davidlifschitzs-projects.vercel.app`;
- the branch alias reported by Vercel was `hermes-consumer-layer-m1-git-m1-80ea8b-davidlifschitzs-projects.vercel.app`;
- an authenticated Vercel-side GET to `/mcp` reached the MCP handler and returned the expected clean HTTP 405 JSON-RPC method error with `Cache-Control: no-store` and the repository's existing security headers.

That authenticated Vercel-side check proves the deployment/rewrite/function path exists. It does **not** prove that an anonymous external MCP client can reach it.

## Verified M1 blocker

A live GitHub Actions MCP Inspector run (`36823909159`) attempted to initialize against the deployed Preview URL from outside Vercel.

The first Inspector request failed before MCP initialization with:

```text
auth_required
Interactive OAuth requires a TTY on stdin or stderr (or MCP_AUTO_OPEN_ENABLED=true).
For CI/non-interactive runs use --stored-auth-only.
```

This is consistent with the Preview being behind Vercel Deployment Protection. No deployed M1 tool call or live Vercel canary receipt was produced by that run.

The next external prerequisite is therefore to make one dedicated M1 HTTPS endpoint anonymously reachable, preferably by adding a Vercel Deployment Protection Exception for the dedicated M1 preview/branch domain rather than weakening protection for unrelated deployments.

Do not use a temporary `_vercel_share` URL or protection-bypass cookie as M1 evidence: ChatGPT needs a normal public HTTPS MCP endpoint.

After the exception is active, run the manual `M1 deployed MCP smoke` GitHub workflow against the public `https://.../mcp` URL. It must initialize, list exactly two tools, call the read tool, call the action tool exactly once, and produce a receipt that can be matched in Vercel runtime logs.

## Verified OpenAI platform state

Current OpenAI developer documentation describes the personal-plugin/developer-mode path for connecting a public HTTPS MCP endpoint and testing MCP tools in ChatGPT.

Authoritative references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

Plan-specific write-tool availability must still be verified empirically in the user's Plus account as part of M1 manual acceptance because current OpenAI documentation surfaces are not fully consistent on that detail.

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

Therefore the project still must verify a supported machine path from our MCP service to the actual Hermes runtime during M2.

## Verified repository reality

- `davidlifschitz/ChatGPTHarnessPlugin` is the canonical repository.
- PR #4 merged on 2026-08-26 and established the upstream-first, multi-harness consumer-layer architecture.
- PR #6 merged on 2026-10-01 and made ChatGPT plugin/MCP the primary V1 consumer channel.
- Hermes is the MVP harness; OpenClaw is planned second.
- The repository contains `tools/hermes_probe.py` for Hermes capabilities/model/session verification with opt-in chat.
- The repository contains a Vercel diagnostic surface with server-only `/api/status` and `/api/chat` routes.
- PR #7 adds the separate M1 `/api/mcp` route and `/mcp` rewrite.
- Browser code is designed not to contain Hermes server credentials.
- The repository does not yet contain a public plugin package/manifest.

## Previous managed Hermes Cloud finding

The August 2026 investigation found that the tested human-facing managed Hermes Cloud dashboard hostname was not a usable `API_SERVER_KEY`-only machine origin. The public gate rejected the opaque API key before the request reached Hermes, and no separate supported machine origin was found in the tested surface.

That finding remains historical evidence about that tested ingress path.

It does not prove that all current/future Hermes Cloud machine-access paths are unavailable.

ADR 0005 therefore remains valid as an allowed fallback: run official Hermes on operator-controlled infrastructure when needed to obtain a secure machine API boundary.

## Architecture decision now recorded

ADR 0006 changes the primary consumer channel:

- ChatGPT plugin/MCP is V1 rather than V2+;
- the personal-plugin path is the first private integration path;
- the standalone Vercel UI is diagnostics/admin/testing;
- public plugin submission follows only after the private Hermes path and user isolation are proven.

This changes the consumer surface and roadmap sequencing.

It does **not** replace the upstream-first harness model or ADR 0005's runtime-boundary decision.

## Not yet verified

- anonymous external MCP initialization through the deployed Vercel endpoint;
- deployed `tools/list` returning exactly the two M1 tools to an external client;
- a deployed read-tool call;
- a deployed action-tool call and matching Vercel runtime-log receipt;
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

To finish M1:

1. Add a Vercel Deployment Protection Exception for one dedicated M1 preview/branch domain so `/mcp` is anonymously reachable over normal HTTPS.
2. Run the `M1 deployed MCP smoke` workflow against that public URL.
3. Verify the smoke-run action receipt in Vercel runtime logs.
4. Add the endpoint as the user's personal plugin in ChatGPT developer mode.
5. Complete the six prompts in `docs/implementation/m1-manual-acceptance.md`.
6. Record the successful deployment, Inspector, read, action receipt, runtime-log, CI, and human-test evidence here.
7. Only then mark M1 green in `ROADMAP.md`.

Then stop M1 work. Hermes begins in M2.

## State-update rule

Plans, mocks, fake adapters, simulated tests, and documentation claims do not prove an external integration works.

Update this file only when behavior is observed against a real surface or verified in authoritative current upstream documentation.
