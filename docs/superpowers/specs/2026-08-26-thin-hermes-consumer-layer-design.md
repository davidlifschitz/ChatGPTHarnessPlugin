# Thin Hermes Consumer Layer Design

## Purpose

Build the smallest consumer-facing product over Nous Research's existing Hermes Agent and Hermes Cloud capabilities. The product should make Hermes usable from a normal mobile/desktop browser while avoiding a duplicate agent platform.

## Product boundary

Hermes/Nous remains authoritative for agent execution, runs, sessions, message history, approvals, steering/stop, skills/toolsets, memory, model/tool access, and hosted lifecycle where supported.

The product may own only consumer-specific gaps demonstrated by real integration testing: onboarding, account-to-agent mapping, server-side credential mediation, simplified UX, entitlements, billing references, product analytics, or lifecycle automation not available through supported upstream surfaces.

## V1 architecture

```text
browser
  -> consumer frontend
  -> optional minimal trusted server boundary
  -> Hermes API server
  -> Hermes Agent

optional lifecycle path:
trusted server/operator
  -> Nous Portal/Hermes Cloud supported lifecycle surface
```

The browser never receives Hermes/Portal credentials.

## M1 design

M1 proves the upstream path before product scaffolding.

1. Build a small executable probe for a configured Hermes API base URL.
2. Probe `/v1/capabilities` and a read-only session endpoint.
3. Report supported features without fabricating absent capabilities.
4. Keep chat execution opt-in so the default probe does not consume model/tool resources.
5. When explicitly enabled, run one real test message through the supported API.
6. Use probe results to choose the least-custom viable frontend, starting with Open WebUI or LobeChat because Hermes documents OpenAI-compatible compatibility.
7. Record gaps before custom backend implementation.

## Security

Configuration uses environment variables or process-local inputs. Credentials are never committed, echoed in normal output, embedded in browser code, or placed in prompts.

## Error behavior

Connection/auth/API failures must produce explicit non-zero exits and human-readable diagnostics that do not include the bearer credential.

Missing optional capabilities are reported as unsupported, not treated as probe failure unless they are required by the specific check.

## M1 acceptance criteria

- a test suite validates the probe against a local HTTP test server;
- read-only probe mode checks real HTTP endpoints and returns structured results;
- no credential appears in logs/output during tests;
- optional live-chat mode is explicit;
- repository docs clearly state that a real Hermes Cloud endpoint still needs live verification;
- no generic control plane, task database, multi-harness adapter, or ChatGPT-specific code is introduced.

## Deferred decisions

Frontend selection, consumer authentication provider, persistence vendor, billing, and per-user Hermes isolation strategy are deferred until M1 supplies evidence. The repo must not guess these choices prematurely.