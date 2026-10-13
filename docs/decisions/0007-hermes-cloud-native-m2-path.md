# ADR 0007 — Use Hermes Cloud's Native User OAuth and RPC for M2

Status: Accepted

Decision date: 2026-10-08. Status/client reconciliation: 2026-10-13; no runtime architecture change.

## Context and selected client

M2 must prove a real Hermes task through the product's MCP boundary. The original October 8 client was the existing private USER-scope plugin. The October 9 checkpoint selects the existing ChatGPT Harness Business custom MCP app for the current user only. These are distinct identities; the older client's evidence cannot satisfy the requested Business-app gate. No replacement app, workspace publication, or replacement agent is authorized.

An older implementation used an operator-controlled Render runtime and HTTP bridge. Its files, CI, deployments, and reviews remain historical. ADR 0005 remains an allowed fallback, not the current selected runtime path. Nous Portal lifecycle MCP is not a task/session transport.

## Decision

Route the selected ChatGPT client through the single-operator Vercel MCP adapter to the existing managed Hermes Cloud agent Fair-dinkum Esky. Hermes Cloud remains authoritative for execution, provider/model configuration, native sessions/messages, tools, memory, and durable history.

Use authorization-code OAuth with PKCE at the ChatGPT boundary and native Hermes Cloud OAuth upstream, privately persisting rotating refresh credentials. Obtain a short-lived upstream WebSocket ticket and present it through the negotiated subprotocol; use Hermes-native JSON-RPC for tasks/session operations.

Use native session.create/session.title operations and correlate turns to Hermes' own user_row_id. Persist only necessary routing/request correlation, task digests, and bounded one-way credential fingerprints. Do not mirror transcripts, retain stale raw credentials, expose upstream row IDs/event cursors/raw tool payloads, or build a generic runtime. Fingerprint overflow fails closed before another submission.

## Recovery semantics

RPC session.history is a display projection that can omit tool-call sidecars and terminal metadata. Read the official protected native export server-side for authoritative correlation, discarding system/configuration/raw tool data before sanitized output. This is a read of upstream-owned history, not a parallel transcript store.

Recovery after a bounded wait requires exact session identity, accepted user row, task digest, paired invocation/result records, and a normal final assistant row in that turn. Missing/conflicting/failed/incomplete evidence leaves the outcome unknown. Foreign replay epochs cannot settle requests.

A caller supplies one stable request_id per logical task. Reuse it only for retrying the same task, and inspect uncertain outcomes before any retry. Request inspection exposes submitted/running/completed/failed/interrupted/timed_out plus outcome_unknown. A successful task result means completion, not submission alone.

## Security and product boundaries

This is single-operator M2, not proof of multi-user isolation, public onboarding, billing, or device/plan-wide availability. Keep OAuth material, tickets, private state, and provider credentials out of ChatGPT, browser code, prompts, outputs, logs, and source control. Existing task proof/spending evidence is not a new authorization for paid tasks or lifecycle actions.

## Consequences and status

Historical direct native bootstrap/refresh, persistence, discovery, model/terminal execution, recovery, replay, and same-session memory proof are recorded in [October 8/9 evidence](../implementation/m2-live-evidence-2026-10-08.md).

On October 13, GitHub reads confirmed passing CI checks and a successful Vercel deployment status for pre-update head 5ca7f79d2511b4ea77fe9186894b918844c2f424. That is not Business-app acceptance or a fresh alias/runtime check. New commits require new checks. See [refresh ledger](../implementation/m2-status-refresh-2026-10-13.md).

The last recorded live blocker is protected operator approval. Current request state and app usability remain unverified. The earlier private plugin's Desktop-only/personal-plan limitation is historical client evidence, not the sole current Business-app blocker.

## Acceptance

Run the [M2 manual acceptance procedure](../implementation/m2-manual-acceptance.md) through the existing Business app, private to the current user, against an identified committed/deployed native revision. Record five-tool discovery, M1 regressions, real session/tasks/tools, recall, negative/security checks, reconnect and safe persistence checks, and sanitized receipts/log correlation.

M2 remains not green; PR #8 remains draft and unmerged. Do not merge or start M3 before the full gate passes. The original decision text and evidence remain in [Git history](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/blob/5ca7f79d2511b4ea77fe9186894b918844c2f424/docs/decisions/0007-hermes-cloud-native-m2-path.md).
