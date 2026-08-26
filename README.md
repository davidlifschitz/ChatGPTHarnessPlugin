# Hermes Consumer Layer

A thin, consumer-facing product layer over Nous Research's existing Hermes Agent and Hermes Cloud infrastructure.

## Goal

Make Hermes usable by normal people from a phone or browser without requiring them to understand terminals, MCP, API keys, model providers, cloud instances, tunnels, or Hermes administration.

This repository does **not** reimplement Hermes' agent runtime, session engine, memory, tool execution, model gateway, or cloud lifecycle when Nous already provides those capabilities.

## V1 system shape

```text
User
  |
  v
Simple web experience
  |
  v
Thin product integration
  |
  +--> Hermes API server (chat, runs, sessions, capabilities)
  |
  +--> Nous Portal / Hermes Cloud (hosting and lifecycle where needed)
```

Hermes remains the agent system. This product owns only the consumer-specific gaps that are actually required: onboarding, user-to-agent mapping, simplified permissions, product UX, and any minimal server-side mediation needed to keep credentials out of the browser.

## Explicit non-goals for V1

- rebuilding a generic agent control plane;
- rebuilding Hermes sessions, runs, approvals, memory, skills, tools, or scheduling;
- supporting multiple harnesses before there is a concrete reason;
- building a ChatGPT plugin, GPT, GPT Action, or MCP client surface;
- exposing Hermes administrative configuration to ordinary users.

ChatGPT is a possible V2+ distribution channel, not a V1 dependency.

## Upstream capabilities we rely on

Current Hermes documentation exposes:

- an OpenAI-compatible API server plus run/session/capability APIs;
- streaming agent events and approvals/control endpoints;
- stable session keys for multi-user memory scoping;
- compatibility with existing web frontends such as Open WebUI and LobeChat;
- Nous Portal OAuth and Hermes Cloud lifecycle management.

See `docs/integrations/hermes.md` and `docs/integrations/nous-portal.md` for the verified boundary.

## Project truth

Read in order:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATE.md`](STATE.md)
3. [`ROADMAP.md`](ROADMAP.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)
5. [`docs/decisions/`](docs/decisions/)

The immediate milestone is to prove the thinnest real consumer path against a real Hermes instance before adding custom infrastructure.