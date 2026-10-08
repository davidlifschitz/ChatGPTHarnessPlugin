# ChatGPT Harness Plugin — Verified Current State

Last verified: 2026-10-08

This file records verified reality, not intended future behavior.

## Current milestone

**M2 — Hermes Plugin End-to-End**

Status: **in progress — native CI, deployed private persistence, credential refresh, and authenticated MCP discovery pass; ChatGPT Hermes acceptance remains pending**

M1 remains green. The current M2 path uses the existing private USER-scope ChatGPT plugin, a single-operator Vercel MCP adapter, and the first-party managed Hermes Cloud agent `Fair-dinkum Esky`. A direct Nous Portal check on 2026-10-08 showed the Plus balance at 18.26 and the existing agent Running/Healthy. This confirms the selected account and agent are available; it does not prove that a task has passed through the native plugin path.

## Native M2 implementation

This branch implements the native Hermes Cloud path. On 2026-10-08, local validation passed 105 Node tests under Node 22, all 11 current Python tests, JavaScript syntax checks, and diff checks. Commit `25b6ddd24417658f4087d1ffff258497ab55d294` passed GitHub runs `37847743494` and `37847736768`; Vercel preview `dpl_2TJ6hhQjGcW6nD1uffkh1JFZctj9` is READY for that exact commit and serves the stable M2 alias. The existing private plugin remains USER-scope release `0.1.0` (`pluginrel_6abe73ef10b08191bf86cc3109ae5306`); a `0.2.0` package is prepared but has not been released.

- The public MCP surface is intended to contain exactly five tools: `get_m1_status`, `run_m1_canary_action`, `start_hermes_session`, `send_hermes_task`, and `get_hermes_session`.
- The adapter uses authorization-code OAuth with PKCE for ChatGPT and Hermes Cloud's native OAuth flow, including rotating refresh credentials held in private connector state.
- The adapter obtains a short-lived Hermes Cloud WebSocket ticket, sends it through the negotiated WebSocket subprotocol, and uses Hermes-native JSON-RPC.
- Session creation stores the requested title through Hermes' native `session.title` operation. Hermes Cloud remains authoritative for session history; the adapter correlates a task with Hermes' own `user_row_id` rather than maintaining a transcript copy.
- The adapter stores request-routing state, task digests, and bounded one-way credential fingerprints for correlation and safe output across rotation. It stores no transcript or stale raw credentials and exposes no Hermes row IDs, event cursors, or raw tool payloads. Fingerprint overflow fails closed before another task submission.
- `send_hermes_task` requires a caller-supplied stable `request_id`. Reuse it only for a retry of the same logical task; use a new ID for a new task. The request guard is designed to prevent duplicate execution after an ambiguous submission. `get_hermes_session` can inspect one request by that ID and report `submitted`, `running`, `completed`, `failed`, `interrupted`, or `timed_out`, plus `outcome_unknown`; an ambiguous result must be inspected before any retry. Correctness must be established on the exact committed and deployed revision before M2 is marked green.

## Historical operator-controlled M2 implementation and preview

The earlier published PR #8 head `50c2d5a` contained the operator-controlled Render bridge. Its Vercel Preview deployment `dpl_8o7Kj9kwz8mp85B5xkbUonSkzSzr` reached `READY`, and its recorded CI passed for the older implementation. That historical evidence does not validate the native Hermes Cloud OAuth, WebSocket, or JSON-RPC path described above. Do not merge PR #8.

Independent review history includes 12 Luna passes and 5 Sol passes across the scoped implementation. The final Sol pass identified historical fingerprint loss; the lead accepted and verified its correction with the 99-test run above. No further independent pass was performed beyond the requested caps. The manual CI ingress workflow is read-only and cannot substitute for authenticated operator or ChatGPT acceptance.

The existing private Vercel Blob store `store_D8DOz7M58EnmRlti` is connected only to the existing project's M2 preview branch. Deployed verification passed create, uncached read, conditional-write contention, duplicate-create preservation, and cleanup checks. Native loopback PKCE authorization completed; the process exited after private credential bootstrap. Separate deployed invocations verified a strong credential version and successful refresh, persistence of rotated credentials, and bearer access. Authenticated direct MCP initialization discovered exactly the five intended tools and returned the M1 ready/version contract. These are direct adapter checks, not ChatGPT acceptance.

The first native session attempt persisted one empty session, verified independently in the Hermes dashboard. The adapter then returned a controlled identifier error during resume. The pinned first-party protocol supports `resumed` and `session_key` canonical identity fields as well as `stored_session_id`; the adapter now validates these forms and rejects disagreements. Local validation passes 106 Node tests, 11 Python tests, and syntax checks; live verification of this correction remains pending. No model task, managed-agent restart, or updated-plugin ChatGPT acceptance has occurred.

The Render runtime and bridge files from that approach remain in the repository. They have not been removed; they are not the selected M2 critical path and do not count as native acceptance evidence.

## M2 live acceptance still required

M2 remains open until all of the following are observed on the same final source revision and deployment:

- final CI and a deployed Vercel `/mcp` endpoint for the native implementation;
- OAuth connection from the existing private USER-scope plugin and a live `tools/list` response containing exactly the five tools documented in the manual acceptance procedure;
- M1 status returning `ready` / `m1-canary-v1`, followed by exactly one `run_m1_canary_action` call with label `m2-regression` and a matching sanitized runtime log receipt;
- one real Hermes Cloud session with a durable title, followed by the same-session task `17 * 23` returning `391` and a matching request receipt;
- a native Hermes terminal-tool call hashing `m2-hermes-tool-proof` to `3a180e42ae7e215ae01e611021419053b015e9d585cddac7aeb145b549ec0632`, with the observed tool name and safe request correlation;
- same-session recall of `m2-hermes-tool-proof` from Hermes history;
- invalid-session and secret-disclosure checks, including confirmation that unauthenticated MCP requests fail before a Hermes ticket or task is created;
- plugin reconnect/refresh and a supported state-preserving restart or reconnect of the existing managed agent, followed by a successful read and continuation of the same session;
- the no-plugin control answering `19 * 29` as `551` without invoking a plugin tool.

Do not mark M2 green until every item is directly observed and recorded without secret values. A `READY` deployment or passing CI from the older PR #8 implementation is not evidence for this gate.

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

The documented Portal MCP surface remains a management interface; it does not provide the task/session tools used by M2. The current working-tree adapter follows a separate Hermes Cloud native OAuth, WebSocket-ticket, and JSON-RPC path. That path is implemented locally but still needs the live acceptance evidence listed above.

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

For M2, ADR 0007 selects the existing first-party managed Hermes Cloud agent and its native RPC path. The older operator-controlled Render definitions remain historical implementation files while the native path is being verified.

## Architecture decision now recorded

ADR 0006 changes the primary consumer channel:

- ChatGPT plugin/MCP is V1 rather than V2+;
- the personal-plugin path is the first private integration path;
- the standalone Vercel UI is diagnostics/admin/testing;
- public plugin submission follows only after the private Hermes path and user isolation are proven.

This changes the consumer surface and roadmap sequencing. ADR 0007 records the M2 runtime choice while preserving Hermes Cloud as the authority for its session and runtime state.

## Not yet verified

- final CI and deployment for the native M2 source;
- native OAuth refresh, WebSocket-ticket, and JSON-RPC behavior through the existing private plugin;
- successful real Hermes session chat and tool-capable task through that plugin;
- same-session continuation after plugin reconnect and supported managed-agent restart;
- sanitized live logs and negative authorization/secret-disclosure results;
- use of Sign in with ChatGPT inside the selected Hermes runtime;
- multi-user OAuth/isolation;
- public plugin package validation/submission/approval;
- any future change that makes MCP apps available on mobile;
- OpenClaw integration;
- billing, entitlements, analytics, or public onboarding.

## Current critical path

M1 is complete. M2 uses the existing private ChatGPT plugin -> Vercel MCP adapter -> first-party managed Hermes Cloud agent `Fair-dinkum Esky` path recorded in ADR 0007. Finish the native code's CI/deployment and live acceptance before moving to M3. Do not merge PR #8 or begin M3 before the native M2 gate passes. The older Render bridge remains in the repository as historical implementation work and is not the M2 acceptance path.

## State-update rule

Plans, mocks, fake adapters, simulated tests, and documentation claims do not prove an external integration works.

Update this file only when behavior is observed against a real surface or verified in authoritative current upstream documentation.
