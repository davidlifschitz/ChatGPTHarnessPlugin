# ADR 0007 — Use Hermes Cloud's Native User OAuth and RPC for M2

Status: Accepted

Date: 2026-10-08

## Context

M2 must prove one real Hermes task from ChatGPT through the product's MCP boundary. The primary V1 surface is the user's existing private USER-scope ChatGPT plugin. The selected runtime is the user's existing first-party managed Hermes Cloud agent, `Fair-dinkum Esky`.

An earlier M2 implementation used an operator-controlled Render Hermes process and a separate HTTP bridge. That work remains in the repository, and its CI and Vercel Preview evidence describe that older implementation. A `READY` deployment of that bridge does not prove the native Hermes Cloud path.

Nous Portal's documented MCP server manages Hermes Cloud instances. M2 uses the Hermes Cloud account's native user authorization and task RPC path instead of treating the management MCP as a session API or exposing an `API_SERVER_KEY`.

## Decision

For M2, route the existing private ChatGPT plugin through the single-operator Vercel MCP adapter to the existing managed Hermes Cloud agent. Hermes Cloud remains authoritative for its process, model/provider authentication, native sessions, messages, tools, and durable history.

The adapter uses OAuth authorization code with PKCE for the ChatGPT connector and Hermes Cloud's native OAuth flow for upstream access. It handles rotating refresh credentials in private connector state. For task calls, it obtains a short-lived WebSocket ticket and presents that ticket in the Hermes WebSocket subprotocol, then sends Hermes-native JSON-RPC requests.

Session creation and labeling use Hermes-native `session.create` and `session.title` operations. A submitted turn is correlated to Hermes' own `user_row_id`; the product does not copy the conversation transcript into a parallel session store. The adapter persists request-routing/correlation state, task digests, and bounded one-way credential fingerprints for safe output across rotation. It stores no stale raw credentials and does not expose Hermes row IDs, event cursors, or raw tool payloads. Fingerprint overflow fails closed before another submission.

Each logical task has a caller-supplied stable `request_id`. The same ID is reused only for retrying that same task; a different task requires a new ID. An ambiguous submission must be inspected by `request_id` before retrying, and the request guard must prevent duplicate execution. `get_hermes_session` exposes the correlated status (`submitted`, `running`, `completed`, `failed`, `interrupted`, or `timed_out`) and `outcome_unknown` flag. A successful task result means Hermes completed the task.

## Boundaries

- This is a single-operator M2 proof. It does not establish multi-user isolation, public onboarding, or billing; those remain M3 work.
- Use the existing managed agent. This decision does not authorize creating, deleting, or replacing Hermes Cloud agents as part of the product flow.
- Do not expose OAuth material, refresh credentials, WebSocket tickets, private connector state, or provider credentials to ChatGPT, browser code, logs, or source control.
- Do not add a generic multi-harness control plane or a product-owned runtime, transcript, memory, or tool-execution system.
- ADR 0005 remains the historical M1 operator-controlled runtime decision and a possible fallback if the selected managed path proves unsupported. It is not the current M2 runtime choice.

## Consequences

The live acceptance must validate the native authorization, refresh rotation, WebSocket-ticket exchange, JSON-RPC behavior, task correlation, and persistence of the existing Hermes session. Local implementation or tests alone do not satisfy M2.

The previous Render runtime and bridge files remain in the repository while this path is being verified. Their earlier tests, CI, and `READY` Preview must be labeled as historical evidence and must not be used to claim native M2 completion.

The current native implementation is still being finalized. This ADR records the chosen architecture; it does not claim that the final source revision has passed CI, has been deployed, or has passed live ChatGPT acceptance.

The existing private USER-scope plugin is release `0.1.0`; the `0.2.0` package is prepared but not released. No native-path live bootstrap, session, plugin call, or agent restart has been performed. Do not merge draft PR #8 or begin M3 before the native M2 gate passes.

## Acceptance

Use the exact five-tool, M1 regression, real-session, minimal-turn, terminal-tool, same-session, authorization, secret-boundary, reconnect, and safe-restart checks in [M2 Manual Acceptance](../implementation/m2-manual-acceptance.md). M2 remains in progress until that evidence is recorded for one committed source revision and its corresponding deployment.
