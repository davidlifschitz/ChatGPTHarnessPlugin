# ChatGPT Harness Plugin — Roadmap

Use ChatGPT's native consumer surface, reuse upstream runtime capabilities, hide infrastructure from users, and implement one harness at a time. Hermes is first; OpenClaw is second.

## M0 — Product reset

Complete: ADR 0006 and merged PR #6 established ChatGPT as the primary V1 consumer surface; standalone Vercel UI became diagnostics/admin/testing. Historical platform research is not a guarantee of current plan/device availability.

## M1 — Plus Personal Plugin Proof

Complete / green as of 2026-10-01. The user's actual Plus account invoked `get_m1_status` and one controlled `run_m1_canary_action` through deployed HTTPS MCP. Receipt `m1_15808f73-b006-427b-aef2-4a31d393264c` matched Vercel logs. Validation, read-only, no-plugin, and secret-disclosure controls were recorded.

This proves the historical personal-plugin product channel, not Hermes or the current Business-app flow. Do not reopen M1 or expand it with unrelated work.

## M2 — Hermes Plugin End-to-End

Active, not green. Last recorded live blocker: protected operator approval for the existing ChatGPT Harness Business app. The current request state and current-user-only app usability have not been freshly checked. PR #8 remains draft and unmerged.

The selected path is the existing Business app -> Vercel MCP adapter -> native Hermes Cloud OAuth/WebSocket/JSON-RPC -> existing Fair-dinkum Esky agent. ADR 0007 selects this path; ADR 0005 is a fallback. Older operator-controlled bridge evidence is historical only.

Completed direct implementation/evidence includes the five-tool surface, private state and refresh rotation, real arithmetic/terminal execution, correlated persisted recovery, replay safety, and same-session memory. GitHub CI/deployment for pre-update head `5ca7f79d2511b4ea77fe9186894b918844c2f424` was checked on October 13. Any new commit requires its own checks. None of this establishes Business-app acceptance.

Remaining work:

1. Reconcile the existing OAuth request in a trusted environment holding the original operator credential. Do not recover/rotate a write-only Secret to bypass the gate.
2. Complete authorized connection and verify current-user-only usability without workspace publication.
3. Discover exactly the five intended tools through the requested app.
4. Run the complete [manual acceptance procedure](docs/implementation/m2-manual-acceptance.md): M1 read, titled native session, arithmetic, terminal hash, recall, invalid session, authorization/secrets, reconnect/safe restart, exactly-once M1 action, and no-plugin control.
5. Tie results to the tested source revision/deployment, preserve prior evidence separately, and verify sanitized logs.

Gate: all required Business-app acceptance checks pass on the identified native revision/deployment. Only then consider marking M2 green. Passing tests, direct clients, the old plugin, and READY deployments are not substitutes. No merge or M3 work is authorized by this roadmap.

## M3 — User authentication and isolation

Not started. Extend the single-operator boundary to unrelated users using supported identity/auth infrastructure, server-side user/runtime/session authorization, and a verified native isolation mechanism. Prove cross-user denial for sessions, memory, credentials, filesystem/tool context, and controls. Define deletion/offboarding and resource/cost limits.

Gate: two independent users can operate without cross-user access or leakage. Existing M2 OAuth alone does not satisfy this.

## M4 — Public package and submission

Not started. Establish production service reliability, supported package/configuration and listing metadata, developer identity/review requirements, website/support/privacy/terms, review access, retention/security documentation, safe observability, and abuse/error testing. Validate and submit; publish only after approval and final supported-user validation.

Gate: approved public distribution and a working end-user path without developer mode. Reverify platform requirements when this milestone starts.

## M5 — Events and native UX

Deferred. Add completion/progress events, optional agent/status/file UI, switching, or better confirmation flows only for measured friction.

Gate: each enhancement helps users without duplicating ChatGPT or harness behavior.

## M6 — OpenClaw

Deferred. Verify its actual auth, transport, state, tools, lifecycle, and isolation; implement the smallest adapter for supported existing outcomes. Revise the seam from evidence rather than forcing Hermes semantics.

Gate: a supported core ChatGPT journey can route to either harness without a duplicate runtime or product identity system.

## M7 — Economics and growth

Deferred. Add billing/entitlements, analytics, onboarding, or lifecycle/capacity automation after the product and second-harness architecture are demonstrated.

Gate: measurable economics and operations without user-managed infrastructure.

## Sequencing and evidence

Completed M1 -> requested Business-app Hermes M2 acceptance -> unrelated-user isolation -> public distribution -> justified UX -> OpenClaw -> economics. Standalone consumer UI is not on the critical path absent a new evidence-backed ADR.

See [STATE.md](STATE.md) and [October 13 refresh](docs/implementation/m2-status-refresh-2026-10-13.md). Preserve dated historical evidence; never relabel it as a new live verification.
