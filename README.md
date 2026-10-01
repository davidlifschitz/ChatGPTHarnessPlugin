# ChatGPT Harness Plugin

A thin ChatGPT-native consumer layer over powerful general-purpose agent harnesses.

**ChatGPT is the primary user surface. Hermes is the first harness. OpenClaw is the planned second harness.**

## Goal

A normal person should be able to open ChatGPT on a supported device, ask for a task to be delegated to an agent, and continue using that agent without understanding terminals, MCP, API keys, model providers, VPSs, tunnels, containers, or harness administration.

The infrastructure can be technical. The user experience cannot be.

## Why this project changed after DevDay 2026

OpenAI's current developer documentation now makes the path we originally wanted first-class:

- ChatGPT developer mode provides full MCP support, including read and write tools, for Plus and Pro.
- A plugin can package skills, an MCP server connection, or both.
- Public plugins can be submitted to a universal directory shared by ChatGPT and Codex.
- Authenticated MCP plugins use the MCP OAuth 2.1 authorization model.
- Hermes Agent is listed as a participating "Sign in with ChatGPT" app for eligible Plus/Pro plan usage.

Authoritative references:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth
- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

These changes remove the previous reason to make a standalone consumer web app the primary V1 distribution channel.

## System shape

```text
User in ChatGPT
      |
      v
ChatGPT Plugin
  - skills/instructions
  - MCP connection
  - optional UI later
      |
      v
Public HTTPS MCP Control Surface
  - user authentication/authorization
  - goal-level agent tools
  - user -> harness/runtime mapping
  - safe confirmation/error handling
      |
      v
Thin Harness Adapter
      |
      +-------> Hermes (MVP)
      |
      +-------> OpenClaw (next)
      |
      +-------> future harnesses when justified
      |
      v
Harness-native runtime/state/tools/memory
      |
      v
Model/provider services
```

The product reuses each harness's execution, sessions, runs, memory, tools, skills, approvals, and model routing. It does not rebuild those systems into another agent platform.

## MVP: Hermes through ChatGPT

The first end-to-end proof is no longer "phone/browser -> custom web app -> Hermes."

It is:

```text
ChatGPT Plus developer mode
  -> personal plugin
  -> public HTTPS /mcp endpoint
  -> Hermes adapter
  -> real Hermes API server
  -> one real tool-capable Hermes task
```

The existing Vercel test surface and Hermes connector code remain useful as diagnostics and implementation scaffolding. They are no longer the product's primary consumer UX.

## Hermes runtime connectivity

Hermes exposes the primitives we need: chat, sessions, runs, streaming, approvals/control, capabilities, skills/toolsets, and stable memory/session scoping.

References:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

The Hermes API server requires `API_SERVER_KEY` and binds to `127.0.0.1` by default. The plugin MCP server must therefore reach a secure machine-accessible Hermes origin without exposing the Hermes key to ChatGPT or browser code.

Nous Portal's documented MCP server can manage Hermes Cloud instances, including listing, creating, starting, stopping, restarting, and destroying them. Its documented tool surface does not currently establish a session/chat transport into an instance:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

Until a supported managed-cloud chat ingress is verified, operator-controlled Hermes hosting remains an acceptable runtime implementation detail under ADR 0005.

## Initial user outcomes

Do not mirror the raw Hermes API as dozens of low-level plugin tools. OpenAI's tool guidance says tools should map to recognizable user goals.

The initial MCP surface should prove outcomes such as:

- find or select an agent;
- start a new agent/session;
- send work to an agent;
- inspect current status or recent output;
- continue an existing agent/session;
- stop an active run when supported.

Exact tool names are implementation details and should be finalized from the real Hermes path.

Reference:

- https://developers.openai.com/plugins/plan/tools

## Authentication and secrets

For personal development, use ChatGPT developer mode against the deployed MCP endpoint.

For multi-user/public operation:

- authenticate end users using the MCP OAuth 2.1 flow;
- enforce authorization in the MCP server on every request;
- keep Hermes/API/provider credentials server-side;
- never expose `API_SERVER_KEY` as a plugin credential;
- require confirmation for destructive or hard-to-reverse actions.

References:

- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/guides/security-privacy

## OpenClaw

OpenClaw follows after the Hermes plugin path is real. Its job is both to add a useful second harness and to reveal which adapter behaviors are genuinely shared.

Do not pre-build a generic multi-harness runtime platform.

## Standalone web surface

The current Vercel UI remains useful for:

- diagnostics;
- direct adapter testing;
- admin/operations;
- fallback testing when ChatGPT-specific behavior must be isolated.

It is not the primary V1 user experience unless plugin limitations discovered during implementation force that decision to be revisited.

## Explicit non-goals

- rebuilding harness execution;
- mirroring harness sessions/runs/memory;
- building a generic task engine or model gateway;
- making users operate VPSs, tunnels, Docker, harness CLIs, or API keys;
- coupling the product to Nous-managed Hermes Cloud;
- forcing OpenClaw into fake Hermes semantics;
- building a standalone consumer app before the plugin path proves it is required.

## Project truth

Read in order:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATE.md`](STATE.md)
3. [`ROADMAP.md`](ROADMAP.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)
5. [`docs/decisions/`](docs/decisions/)

Current execution order: **Plus personal plugin proof -> real Hermes plugin path -> auth/isolation -> public plugin submission -> OpenClaw.**
