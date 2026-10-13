# ChatGPT Harness Plugin — Architecture

This document defines durable boundaries. See STATE.md for observed status and ROADMAP.md for sequencing.

## System shape

```text
ChatGPT client
  -> public HTTPS MCP service
     - authentication and authorization
     - user/runtime mapping
     - goal-level tools and safe errors
  -> thin harness adapter
  -> harness-native execution/state/tools/memory
  -> model/provider services
```

ChatGPT is the primary V1 surface under ADR 0006. A plugin package, MCP client/app configuration, and the MCP service are distinct artifacts. Package files may describe skills, connections, metadata, and later UI; they never contain server credentials. The Vercel browser surface is diagnostic/admin infrastructure.

## Selected M2 transport

ADR 0007 selects the existing managed Hermes Cloud agent through native upstream OAuth, short-lived WebSocket tickets, and Hermes JSON-RPC. The requested acceptance client is the existing ChatGPT Harness Business app; the earlier PRIVATE / USER plugin is a separate historical client.

ChatGPT authenticates to the Vercel MCP service through authorization-code OAuth with PKCE. The adapter independently authenticates upstream and privately persists rotating credentials. A WebSocket ticket is negotiated in the upstream subprotocol. This path is not the Nous Portal lifecycle MCP and is not the older API_SERVER_KEY HTTP/Render bridge. ADR 0005 remains an operator-controlled fallback.

## Focused tool surface

M2 exposes exactly:

- `get_m1_status`
- `run_m1_canary_action`
- `start_hermes_session`
- `send_hermes_task`
- `get_hermes_session`

Do not expand to dozens of raw runtime endpoints or add cancellation/discovery/event tools before a verified user need. Hermes is first; OpenClaw later tests the real adapter seam rather than inheriting assumed Hermes semantics.

## State authority and correlation

Hermes owns session creation/titles, messages, execution, memory, tool records, and durable history. The adapter may retain routing references, task digests, request status, account linkage, and bounded one-way credential fingerprints. It must not maintain a transcript mirror or generic task engine.

Each logical task has a caller-supplied stable `request_id`. Reuse it only for the same logical task. Inspect an ambiguous submission before any retry. Request status includes submitted, running, completed, failed, interrupted, or timed_out, with a separate outcome_unknown flag. A response deadline does not establish upstream cancellation or failure.

Persisted recovery requires the exact accepted user turn/task digest, paired tool calls/results, and a normal final assistant row. Hermes' protected native export provides authoritative correlation where display history omits proof metadata. Discard configuration, system prompts, raw tool payloads, and credentials before public output. Foreign replay epochs or prose claiming tool use do not prove completion.

## Security and isolation

Authenticate and authorize every request, validate inputs server-side, and reject unsupported capabilities explicitly. Client-supplied identifiers are not authorization. Keep OAuth material, tickets, private connector contents, provider credentials, and API keys out of packages, browser JavaScript, prompts, outputs, logs, and source control. Bound and sanitize results/errors. Destructive or hard-to-reverse actions require explicit confirmation.

Single-operator M2 OAuth is not multi-user isolation. M3 must prove two unrelated users cannot access each other's runtime/session state, memory, tool context, credentials, or controls, and must define offboarding and limits. Do not assume HTTP session-key isolation applies unchanged to native Cloud transport.

## Availability and distribution

A past personal-plugin success does not prove current plan/device availability for a different client. Mobile, public submission, and Sign in with ChatGPT provider use remain separately unverified. Keep M2 testing private to the current user; stop if the Business app requires workspace-wide publication.

Public distribution follows working private Hermes acceptance and multi-user isolation. It requires the relevant production endpoint, package/listing validation, identity/review materials, retention/privacy policies, and supported end-user checks at that time. Optional UI/events follow demonstrated user friction; they are not M2 prerequisites.

## Evidence hierarchy

1. Dated observed behavior on the exact deployed integration/client.
2. Current authoritative upstream documentation for platform capabilities.
3. STATE.md and its linked verification/evidence ledger.
4. Accepted ADRs and this architecture document.
5. ROADMAP.md / PROJECT.md.
6. Implementation plans and older conversation history.

Historical direct MCP evidence is not Business-app acceptance. CI success and deployment completion are not authenticated discovery or end-to-end execution.
