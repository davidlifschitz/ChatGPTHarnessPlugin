# ChatGPT Harness Plugin

A thin ChatGPT-native consumer layer over general-purpose agent harnesses. ChatGPT is the primary user surface; Hermes is the first harness; OpenClaw is planned second.

## Current status

Documentation reconciled on 2026-10-13. M1 is complete. M2 remains blocked at the last recorded live checkpoint by operator approval for the existing ChatGPT Harness Business app. Its current OAuth request status and current-user-only usability have not been reverified. PR #8 remains open, draft, and unmerged.

Fresh GitHub checks confirmed passing test jobs and a successful Vercel deployment status for pre-update head `5ca7f79d2511b4ea77fe9186894b918844c2f424`. This is not a new ChatGPT end-to-end acceptance result. Any documentation commit needs its own CI/deployment checks before exact-head claims are updated.

See [STATE.md](STATE.md) and [October 13 verification](docs/implementation/m2-status-refresh-2026-10-13.md). `main` contains the merged M1 baseline; active M2 implementation and documentation are on `m2/hermes-e2e` in [PR #8](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/pull/8). Do not merge M2 just to synchronize the default branch.

## Goal

A user should delegate work and continue an agent session inside ChatGPT without managing terminals, MCP, API keys, model providers, cloud hosts, containers, tunnels, or harness administration. The infrastructure can be technical; the user experience cannot be.

## Selected M2 path

```text
Existing ChatGPT Harness Business app
  -> authenticated HTTPS Vercel MCP adapter
  -> Hermes Cloud native OAuth, WebSocket ticket, and JSON-RPC
  -> existing managed Hermes agent Fair-dinkum Esky
  -> Hermes-native execution, tools, sessions, history, and memory
```

The older PRIVATE / USER plugin is a separate historical client. Its M1 success and direct MCP tests do not satisfy Business-app acceptance. Keep the requested Business app private to the current user; stop if workspace-wide publication is required.

The five-tool M2 surface is:

- `get_m1_status`
- `run_m1_canary_action`
- `start_hermes_session`
- `send_hermes_task`
- `get_hermes_session`

Direct adapter evidence covers native credential refresh/persistence, real arithmetic and terminal execution, timeout recovery, completed-request replay, and same-session recall. The Business-app invocation gate remains unproven.

## Architecture and boundaries

The MCP service owns authentication, authorization, user/runtime mapping, focused tool mediation, and minimal routing/correlation state. Hermes owns its runtime semantics and durable agent history. Do not rebuild an agent runtime, mirror transcripts, introduce a generic task engine/model gateway, or pre-generalize for OpenClaw.

[ADR 0006](docs/decisions/0006-chatgpt-plugin-primary-channel.md) makes ChatGPT the primary consumer channel. [ADR 0007](docs/decisions/0007-hermes-cloud-native-m2-path.md) selects native Hermes Cloud for M2. The operator-controlled runtime option in [ADR 0005](docs/decisions/0005-operator-controlled-harness-runtime.md) remains a fallback, not the selected critical path. Older Render bridge files and their deployments are historical evidence only. Nous Portal lifecycle MCP is not the task/session transport.

## Safety and acceptance

Keep all OAuth credentials, tickets, harness/provider secrets, and private connector state server-side and out of prompts, browser code, outputs, logs, and source control. Inspect an ambiguous task by its stable `request_id` before retrying; do not resubmit an uncertain command. Destructive or hard-to-reverse actions require explicit confirmation.

M1's actual Plus personal-plugin proof on October 1 does not establish current plan-wide or device-wide availability for M2. Do not assume mobile support, public distribution, multi-user isolation, or Sign in with ChatGPT model-provider use has been proven.

Run [M2 manual acceptance](docs/implementation/m2-manual-acceptance.md) through the existing Business app before marking M2 green, merging PR #8, or starting M3. The standalone Vercel UI is diagnostics/admin/testing, not the primary consumer UX.

## Project documents

1. [PROJECT.md](PROJECT.md) — product contract
2. [STATE.md](STATE.md) — verified reality and uncertainty
3. [ROADMAP.md](ROADMAP.md) — sequencing and gates
4. [ARCHITECTURE.md](ARCHITECTURE.md) — durable boundaries
5. [Architecture decisions](docs/decisions/)

Sequence: completed M1 -> Business-app Hermes M2 acceptance -> multi-user isolation -> public distribution -> justified UX enhancements -> OpenClaw.
