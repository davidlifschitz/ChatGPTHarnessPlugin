# ADR 0006 — Make the ChatGPT Plugin the Primary V1 Channel

Status: Accepted

Date: 2026-09-30

## Context

The project originally started with ChatGPT as the desired consumer interface: users should be able to access capable general-purpose agent harnesses from a familiar phone/desktop conversational surface without managing terminals, API keys, MCP configuration, tunnels, containers, or runtime infrastructure.

In August 2026, the repository deliberately moved ChatGPT to V2+ because the product path available at the time did not justify making ChatGPT the critical dependency. ADRs 0003–0005 therefore made a standalone mobile-friendly web client the V1 consumer surface while preserving an upstream-first Hermes/OpenClaw architecture.

DevDay 2026 and the current OpenAI developer platform materially change that constraint.

Current OpenAI documentation now establishes:

- ChatGPT developer mode provides full MCP support for read and write tools on Plus and Pro.
- A developer can create a personal plugin by connecting a deployed HTTPS MCP server.
- A plugin can package skills, an MCP connection, or both, with optional UI.
- Public plugins can be submitted for review and published to the universal directory shared by ChatGPT and Codex.
- Authenticated plugin MCP servers use the MCP OAuth 2.1 authorization model.
- MCP Events are available as a later mechanism for server-originated updates/automations.
- Hermes Agent is listed as a participating "Sign in with ChatGPT" app for eligible ChatGPT plan usage.

Authoritative OpenAI references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/mcp-events
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

These capabilities remove the product-access reason for treating ChatGPT as a later channel.

## Decision

Make **ChatGPT plugin/MCP the primary V1 consumer channel**.

The first product proof is:

```text
ChatGPT Plus developer mode
  -> personal plugin
  -> our deployed public HTTPS MCP service
  -> one read tool + one controlled action tool
```

The first harness proof then extends the same boundary:

```text
ChatGPT
  -> plugin
  -> our MCP service
  -> Hermes adapter
  -> real Hermes API server
  -> real tool-capable Hermes task
```

The plugin package contains workflow guidance and the MCP connection. The public MCP service becomes the durable ChatGPT-facing backend boundary for authentication, authorization, user/runtime mapping, goal-level tools, and harness adapters.

The existing standalone Vercel web client is retained as a diagnostic/admin/test surface. It is no longer the primary V1 consumer experience.

## Relationship to prior ADRs

### ADR 0003

The upstream-first consumer-layer decision remains accepted.

The sentence that makes ChatGPT plugin/Apps SDK/MCP V2+ is superseded by this ADR.

### ADR 0004

The multi-harness product and thin-adapter decision remains accepted.

The sequencing that puts a Hermes production web MVP before ChatGPT is superseded by this ADR.

### ADR 0005

The operator-controlled Hermes runtime decision remains accepted when required to obtain a secure machine API boundary.

This ADR changes the consumer/client boundary, not the harness runtime ownership rule.

The M1 acceptance wording in ADR 0005 referring to a protected custom web client is superseded. The same runtime/security constraints now support the ChatGPT plugin path.

## Hermes connectivity constraint

The change on the ChatGPT side does not automatically solve Hermes runtime networking.

Hermes' documented API server still requires `API_SERVER_KEY`, binds to `127.0.0.1` by default, and exposes the session/run/chat primitives this project needs:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

Nous Portal separately documents an OAuth MCP server for Hermes Cloud lifecycle management:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

Its documented operations manage instances; they do not establish the per-instance session/chat transport required by this product.

Therefore the MCP service still needs a supported secure machine path to the real Hermes API server. Operator-controlled hosting remains the fallback until another supported path is verified.

## Tool-design constraint

Do not expose the Hermes API mechanically as plugin tools.

OpenAI recommends designing tools around recognizable user outcomes:

- https://developers.openai.com/plugins/plan/tools

The first plugin surface should stay deliberately small and prove starting/sending/continuing/inspecting/stopping agent work.

## Authentication constraint

Personal development can use developer mode.

Public/multi-user operation must use proper MCP user authentication/authorization. The project will follow OpenAI's OAuth 2.1 guidance rather than pass raw harness API keys through ChatGPT:

- https://developers.openai.com/plugins/build/auth

## Consequences

- A ChatGPT Plus account is sufficient for the documented personal-plugin development path.
- ChatGPT Business is no longer an MVP prerequisite.
- The first engineering milestone becomes an MCP endpoint rather than a standalone consumer frontend.
- Existing Vercel/Hermes connector work remains reusable as backend/diagnostic code.
- Public plugin packaging/submission moves earlier, but only after the private Hermes path and multi-user isolation are real.
- Mobile ChatGPT behavior remains a release acceptance item that must be verified on the actual supported surface rather than assumed.
- OpenClaw remains second and validates the adapter boundary.
- A standalone consumer web product becomes optional rather than mandatory.

## Acceptance

This ADR is implemented in planning when the canonical README, PROJECT, ARCHITECTURE, ROADMAP, STATE, and project instructions all use the plugin-first sequence.

Runtime implementation begins with M1: a real Plus personal plugin invoking our deployed MCP server.
