# ChatGPT Harness Plugin — Verified Current State

Last verified: 2026-10-01

This file records verified reality, not intended future behavior.

## Current milestone

**M2 — Hermes Plugin End-to-End**

Status: **in progress — implementation/CI/Preview green; real Hermes end-to-end gate not yet verified**

M1 remains green. M2 now has a tested Hermes session adapter, a deliberately small ChatGPT-facing MCP surface, a restricted operator-controlled Hermes runtime definition, and a manual-only live smoke/acceptance suite. The real Render runtime has not been provisioned, the M2 Vercel Preview has not been wired to that runtime, and no M2 live Hermes task has yet been accepted through the private ChatGPT plugin.

## Verified M2 implementation state

Draft PR #8 (`m2/hermes-e2e`) contains the current M2 implementation.

Verified at commit `31f3635d935a48041fd972cdc9877628fc2cbef2`:

- the M1 tools remain present with their existing structured M1 contract;
- the MCP server adds exactly three Hermes-facing tools: `start_hermes_session`, `send_hermes_task`, and `get_hermes_session`;
- the server-side Hermes adapter uses Hermes-native `/api/sessions`, session chat, and persisted session messages instead of mirroring conversation state;
- the Hermes adapter validates session/task inputs, bounds returned text/tool names, uses explicit request timeouts, and emits sanitized model-readable errors without upstream error bodies;
- the M2 action logger records an opaque M2 request ID and session-ID length, not prompts, credentials, raw tool payloads, or session IDs;
- the operator-controlled runtime definition uses the official `nousresearch/hermes-agent:latest` image and a persistent `/opt/data` disk;
- the raw Hermes API is configured for container loopback only, while the public bridge uses a separate bearer credential and a narrow allowlist limited to the M2/diagnostic routes;
- the bridge blocks unrelated config/env/run/mutation routes and does not expose the internal Hermes `API_SERVER_KEY`;
- `runtime/hermes/render.yaml` declares the model-provider key and bridge key as external secret placeholders; no credential values are committed;
- the proof runtime defaults to `gpt-5.4-mini`, which supports Chat Completions and function calling while reducing API-token cost relative to the earlier `gpt-5.4` default;
- `.github/workflows/m2-live-smoke.yml` is manual-only and requires an explicit live-action confirmation before creating a real Hermes session/model/tool call;
- `docs/implementation/m2-manual-acceptance.md` defines the M1 regressions, real minimal turn, real tool-capable turn, same-session continuation, controlled failure, secret-isolation check, and restart-persistence gate.

Verified CI/deployment evidence for that commit:

- GitHub Actions run `36890550131` completed successfully;
- 11 Python unit tests passed, including the Hermes probe and restricted bridge boundary tests;
- Python compilation and the runtime shell syntax check passed;
- 28/28 Node web/MCP/runtime tests passed;
- server-side JavaScript syntax checks passed;
- Vercel Preview deployment `dpl_5squkXbwTBYTka5aS3gNZ5ctjefX` reached `READY`;
- its branch alias is `hermes-consumer-layer-m1-git-m2-0159fc-davidlifschitzs-projects.vercel.app`.

## M2 external acceptance still required

The following are **not yet verified** and therefore M2 is not green:

- a paid persistent Render Hermes service actually provisioned from the M2 runtime definition;
- live Render health against the real Hermes process;
- the M2 Vercel Preview configured with the Render service origin and bridge credential;
- a normal public/unprotected M2 `/mcp` endpoint reachable by MCP Inspector/ChatGPT;
- the private ChatGPT plugin updated/released against the M2 endpoint;
- a real Hermes minimal turn;
- a real Hermes tool-capable turn with independently observed tool-use evidence;
- same-session continuation through ChatGPT;
- controlled invalid-session behavior against the real runtime;
- runtime restart/redeploy with the same Hermes session still readable afterward;
- final M1 read/action regressions through the M2 private plugin.

Do not mark M2 green or merge PR #8 until every item above is directly observed and recorded without secret values.

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

Verified final CI evidence for commit `d5e770c431d078aa1f49c3fc724845fb3ff62b65`:

- GitHub Actions run `36875205687` completed successfully;
- the repository test workflow passed on the M1 branch;
- earlier M1 CI validation also established six passing Python Hermes-probe tests, Node `v22.23.3`, 18/18 passing JavaScript tests, and a passing `npm run check`.

Verified final deployment and ChatGPT evidence:

- Vercel deployment `dpl_5nHGYvAAJBeixdmKrdxvRRfoheas` reached `READY` for branch commit `d5e770c431d078aa1f49c3fc724845fb3ff62b65`;
- stable branch alias: `hermes-consumer-layer-m1-git-m1-80ea8b-davidlifschitzs-projects.vercel.app`;
- a private USER-scope ChatGPT plugin, `chatgpt-harness-plugin` version `0.1.0`, was created and connected to the deployed M1 endpoint;
- from the user's actual ChatGPT Plus account, `get_m1_status` returned M1 status `ready` with version `m1-canary-v1`;
- from the user's actual ChatGPT Plus account, `run_m1_canary_action` ran exactly once with label `david-manual-test` and returned receipt `m1_15808f73-b006-427b-aef2-4a31d393264c`;
- Vercel runtime logs independently matched that exact receipt at `POST /mcp 200` with event `m1_canary_action` and `label_length: 17`;
- the empty-label action test was rejected by input validation and returned no successful receipt;
- a follow-up status check invoked only the read-only status tool;
- `17 × 23` returned `391` without invoking a plugin tool;
- the sensitive-server-data prompt invoked no plugin tool and exposed no environment variables, secrets, credentials, or deployment configuration.

These observations satisfy the six-prompt manual acceptance suite and the M1 read/action gate.

## Resolved M1 blocker

A live GitHub Actions MCP Inspector run (`36823909159`) attempted to initialize against the deployed Preview URL from outside Vercel.

The first Inspector request failed before MCP initialization with:

```text
auth_required
Interactive OAuth requires a TTY on stdin or stderr (or MCP_AUTO_OPEN_ENABLED=true).
For CI/non-interactive runs use --stored-auth-only.
```

This is consistent with the Preview being behind Vercel Deployment Protection. No deployed M1 tool call or live Vercel canary receipt was produced by that run.

That ingress blocker was subsequently resolved for the dedicated M1 branch endpoint. The private ChatGPT plugin initialized against the normal HTTPS endpoint, discovered the M1 tools, and successfully exercised both the read and controlled-action paths. No temporary `_vercel_share` URL or protection-bypass cookie was used as acceptance evidence.

Current Vercel references:

- https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan
- https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions

The September 9, 2026 Vercel changelog states that Deployment Protection Exceptions are free on every plan. The older exception documentation contains the dashboard flow for adding an unprotected preview domain; its older plan-pricing sentence is superseded by that changelog.

## Verified OpenAI platform state

Current OpenAI developer documentation describes the personal-plugin/developer-mode path for connecting a public HTTPS MCP endpoint and testing MCP tools in ChatGPT.

Authoritative references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

Plan-specific write-tool availability must still be verified empirically in the user's Plus account as part of M1 manual acceptance because current OpenAI documentation surfaces are not fully consistent on that detail.

Specifically, the OpenAI developer homepage currently states that developer mode provides full MCP read/write support in Plus and Pro, while the current OpenAI Help Center page says full MCP is currently available to Business and Enterprise/Edu and describes Pro as read/fetch-only.

Conflicting official references:

- https://developers.openai.com/chatgpt
- https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt

The same current Help Center page explicitly says MCP apps are not available on mobile and are web-only. Therefore iPhone/mobile invocation is not an M1 gate and must not be represented as currently supported.

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
- M1 added the separate `/api/mcp` route and `/mcp` rewrite.
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

- plugin -> MCP -> Hermes connectivity;
- successful real Hermes session chat through the plugin;
- a successful tool-capable Hermes task through the plugin;
- the final Hermes runtime host/origin;
- use of Sign in with ChatGPT inside the selected Hermes runtime;
- multi-user OAuth/isolation;
- public plugin package validation/submission/approval;
- any future change that makes MCP apps available on mobile;
- OpenClaw integration;
- billing, entitlements, analytics, or public onboarding.

## Current critical path

M1 is complete. Stop M1 work here.

The next milestone is M2: prove one real Hermes task through the now-verified ChatGPT -> personal plugin -> MCP boundary. Do not expand M1 with Hermes, OAuth, OpenClaw, public submission, or unrelated product work.

## State-update rule

Plans, mocks, fake adapters, simulated tests, and documentation claims do not prove an external integration works.

Update this file only when behavior is observed against a real surface or verified in authoritative current upstream documentation.
