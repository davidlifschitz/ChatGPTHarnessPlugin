# ChatGPT Harness Plugin — Verified Current State

Documentation reconciled: 2026-10-13. Fresh verification scope: GitHub PR/check/status reads only. Last recorded live app/operator/Portal observations: 2026-10-09. Failed public fetches do not establish HTTP status or service health.

## Current milestone

M1 is complete / green as of 2026-10-01. M2 — Hermes Plugin End-to-End remains not green. The last recorded live blocker is protected operator approval for the existing ChatGPT Harness Business app. Its current OAuth request status and current-user-only usability remain unverified. PR #8 is open, draft, and unmerged. No M3 work.

## Fresh GitHub verification — October 13

Read-only connector queries observed:

- PR #8 head: `5ca7f79d2511b4ea77fe9186894b918844c2f424`, branch `m2/hermes-e2e`.
- Base `main`: `8d0ded361deacec64138bbaf2701f7dc9bab4602`, the merged M1 baseline.
- Two test checks completed successfully: [37887174022](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/actions/runs/37887174022/job/113679673369) and [37887169310](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/actions/runs/37887169310/job/113679658823).
- Vercel Preview Comments check succeeded.
- Combined commit status is success; Vercel says Deployment has completed and links [deployment 3JCaUyzNqXhbiaxzqeayMXFNXRJ4](https://vercel.com/davidlifschitzs-projects/hermes-consumer-layer-m1/3JCaUyzNqXhbiaxzqeayMXFNXRJ4).

These checks are attached to the pre-reconciliation head and completed October 9; reading them October 13 is not rerunning CI or redeploying. A subsequent documentation commit requires its own checks. The PR records `43027acac53fed05648666c656a3f6bb27a6aaca` as the latest runtime-changing source and later changes as documentation only.

The stable M2 alias was last recorded as mapping to `dpl_3JCaUyzNqXhbiaxzqeayMXFNXRJ4`. Current alias routing was not independently reverified. Earlier `dad27d2` / `dpl_7mDqrtgRYubjYZYa4MRa2kvGhidw` references are historical checkpoints, not current-head claims.

## Live verification limits

Public fetches of the stable `/mcp`, authorization-server metadata, and protected-resource metadata endpoints returned extraction failures, not inspectable HTTP responses. No fresh 401/200 claim is made. No Vercel/browser connector was available in discovery. No authenticated operator, ChatGPT UI, Nous Portal, logs, tool discovery, or Hermes execution check was performed in this refresh.

October 9 observations remain dated historical evidence:

- Anonymous MCP ingress returned OAuth 401 and metadata returned 200.
- The installed Business app offered Connect/dev mode/OAuth; admin showed zero tools and loading/disabled configuration controls. Cause of zero-tool discovery and current-user-only usability were unresolved.
- The connection disclosure was approved, but separate server-side approval had not completed.
- The old request `OUGosGM4g2em8E1WoKk03w` was unreconciled; no protected lookup/approval occurred.
- The checked process lacked the original operator credential; its saved Vercel variable was a write-only Secret. Historical CLI login does not establish credentials available in this session.
- Nous Portal showed Plus, $17.68 available, and Fair-dinkum Esky ONLINE / Running / Healthy. These are not October 13 balance/health claims.

## Selected implementation and client identity

Current acceptance client: existing ChatGPT Harness Business app `plugin_asdk_app_6ac86a15496481919e125f50d9a9c60b`, private to the current user without workspace publication. Older PRIVATE / USER plugin version 0.2.1 (`pluginrel_6ac84d5ae8c88191aaf76207649c146d`) remains a distinct historical client. Do not substitute it or a direct MCP client for Business-app acceptance.

ADR 0007 selects Vercel MCP -> native Hermes Cloud OAuth -> short-lived WebSocket ticket -> Hermes JSON-RPC -> existing Fair-dinkum Esky agent. The five-tool surface is `get_m1_status`, `run_m1_canary_action`, `start_hermes_session`, `send_hermes_task`, and `get_hermes_session`.

Hermes owns sessions, titles, execution, tools, history, and memory. The adapter owns private credentials and minimal routing/request correlation, task digests, and bounded credential fingerprints. Stable request IDs and authoritative persisted recovery protect against resubmitting ambiguous work. No transcript mirror is intended.

## Historical direct native proof — not Business-app acceptance

Recorded implementation validation included 109 Node tests and 11 Python tests at an earlier checkpoint. Direct deployed/native checks established private Blob persistence/CAS, refresh credential rotation, authenticated five-tool discovery, arithmetic, actual terminal call/result correlation, timeout recovery, replay without duplicate execution, and same-session memory.

Proof session `20261008_214510_4f5165`:

- Arithmetic request `m2_11a1b2cc-ee25-44c2-8bb3-ff41705725a2` returned 391 with no tool call.
- Terminal request `m2_a0c4b085-37ef-43c0-88ff-01e6300881c5` was submitted once, exceeded the bounded wait, and later recovered as completed with one matched terminal call.
- Completed-request replay left history unchanged at six messages/one tool invocation; recall returned `m2-hermes-tool-proof`.

The earlier configured model failed with model-not-found; a listed free model was selected. The historical operator approval capped the pending proof at $1 of existing credit; it is not a new spending authorization. No fresh task, paid-model request, purchase, or restart was made in this refresh.

## Business-app acceptance

See [manual acceptance](docs/implementation/m2-manual-acceptance.md). Current evidence supports no new Business-app pass:

| Check | Recorded result |
| --- | --- |
| 1. M1 read | BLOCKED; no authenticated Business-app invocation |
| 2. Titled native session | NOT TESTED through Business app |
| 3. Arithmetic | NOT TESTED through Business app |
| 4. Terminal hash proof | NOT TESTED through Business app |
| 5. Same-session memory | NOT TESTED through Business app |
| 6. Invalid session | NOT TESTED through Business app |
| 7. Authorization/secrets | BLOCKED/incomplete; historical anonymous ingress is partial evidence only |
| 8. Reconnect/safe restart | NOT TESTED through Business app |
| 9. Exactly-once M1 action | NOT TESTED; no Business-app receipt |
| 10. No-plugin control | Historical PASS: actual ChatGPT returned 551; not rerun |

Control conversation: `6ac81022-9fe8-83ea-b461-0e0a9d3ec90f`. Preserve this as historical evidence rather than inventing a new run.

M2 needs identified source/deployment, authorized current-user-only connection, five-tool discovery, all task/session/security/reconnect checks, and independently correlated sanitized receipts/logs. A READY deployment or direct adapter proof is not enough. New commits need their own CI/deployment basis.

## M1 completion retained

PR #6 established the plugin-first plan and PR #7 merged the canary transport on October 1. The actual Plus personal plugin returned ready / m1-canary-v1 and ran the action exactly once with label david-manual-test. Receipt `m1_15808f73-b006-427b-aef2-4a31d393264c` matched Vercel logs. Invalid-input, read-only, no-plugin, and sensitive-data controls were recorded. M1 does not need reimplementation.

## Remaining unverified capabilities

- Current protected OAuth request state and Business-app availability/discovery.
- Full Hermes task and all acceptance checks through the requested Business app.
- Session continuation after the required reconnect/safe managed-agent restart.
- Fresh sanitized live-log and negative-path evidence for that acceptance run.
- Multi-user isolation, public package/review/onboarding, mobile support, Hermes use of Sign in with ChatGPT, OpenClaw, billing/entitlements/analytics.

## History and next checkpoint

The August API_SERVER_KEY dashboard-ingress finding does not invalidate the separately implemented native OAuth/RPC path. ADR 0005 remains a fallback; older Render bridge/runtime files and reviews/deployments remain historical, not the selected M2 path. ADR 0006 sets the consumer channel; ADR 0007 sets the native runtime boundary. No new implementation or independent security review ran in this documentation refresh.

Preserved detail: [October 8/9 live evidence](docs/implementation/m2-live-evidence-2026-10-08.md), [prior state at pre-update head](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/blob/5ca7f79d2511b4ea77fe9186894b918844c2f424/STATE.md), accepted ADRs, and Git history. [October 13 ledger](docs/implementation/m2-status-refresh-2026-10-13.md) documents new verification and limits.

Next: the original credential holder checks the old operator request from a trusted environment. Approve only an observed unexpired pending request with explicit authorization; confirm expiry before a fresh Connect attempt. Never paste credentials into chat/arguments/logs/browser JavaScript or export/decrypt/rotate a write-only Secret to bypass this gate. Then complete the Business-app acceptance procedure without workspace publication. Do not merge PR #8 or begin M3 before the gate passes.
