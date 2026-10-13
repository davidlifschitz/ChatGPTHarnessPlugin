# ChatGPT Harness Plugin — Project Instructions

Before substantive work read PROJECT.md, STATE.md, the relevant ROADMAP.md milestone, ARCHITECTURE.md, accepted ADRs, and relevant implementation/evidence documents. Use observed exact-revision behavior over older plans or conversation history.

## Current critical path

M1 completed on 2026-10-01. M2 — Hermes Plugin End-to-End is active and not green. The requested client is the existing ChatGPT Harness Business app, distinct from the older PRIVATE / USER plugin. The selected runtime is the existing managed Hermes Cloud agent Fair-dinkum Esky via the native OAuth/WebSocket/JSON-RPC adapter under ADR 0007.

The last recorded live blocker is protected operator approval. Current request state, Business-app tool discovery/usability, and agent health must not be inferred from stale UI or historical evidence. See STATE.md, docs/implementation/m2-status-refresh-2026-10-13.md, and the manual acceptance procedure.

Do not reopen M1, merge draft PR #8, begin M3, publish workspace-wide, create a replacement app/agent, or perform new paid/model/lifecycle actions merely to refresh documentation. A documentation push may trigger existing CI/preview automation; new checks are not known until observed.

## Development rules

- Every substantive change maps to a roadmap milestone.
- ChatGPT is the primary V1 surface; web UI is diagnostics/admin/testing.
- Hermes is first; OpenClaw follows verified Hermes acceptance and later isolation/distribution work.
- Separate harness software from hosting; ADR 0005 is an allowed fallback, not selected M2 transport.
- Reuse upstream sessions/history, tools, memory, approvals, and model routing.
- Do not introduce a generic runtime, task engine, model gateway, scheduler, or transcript mirror.
- Keep harness-specific transport behind the smallest practical adapter seam.
- Keep credentials, tickets, private connector state, and sensitive payloads out of packages, browser code, prompts, outputs, logs, issues, PRs, and source control.
- Validate input/authentication/authorization server-side; model behavior is not access control.
- Use stable request IDs and inspect outcome-unknown tasks before retrying.
- Destructive or hard-to-reverse actions require explicit confirmation.
- Unsupported/unverified capabilities fail explicitly.
- Keep direct MCP proof separate from actual requested ChatGPT client acceptance.
- Record source revision, observation date, CI/deployment basis, and verification limits.
- Do not call old evidence current or mark M2 green from tests/deployment alone.
- Preserve original historical ledgers and accepted decision history.
- Long-lived design changes require an ADR.
- Public distribution and multi-user isolation remain later gates.

## Operator checkpoint

Protected lookup/approval requires the original operator Bearer credential in a trusted environment. Never request its value in chat or export/decrypt/rotate a write-only Secret to bypass the checkpoint. Reconcile the old request before a new Connect attempt; approval is conditional on a live unexpired pending record and requires explicit authorization. Documentation updates do not authorize OAuth approval.
