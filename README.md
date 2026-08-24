# ChatGPTHarnessPlugin

A shared control plane and ChatGPT plugin platform for connecting ChatGPT to general-purpose agent harnesses such as Hermes, OpenClaw, Pi, and future runtimes.

## Goal

Make capable agent harnesses usable directly from ChatGPT on web, mobile, and desktop/Codex without requiring end users to understand MCP servers, tunnels, VPS hosting, runtime processes, or harness-specific infrastructure.

Hermes is the first runtime integration, not the identity of the product.

## Architecture

```text
ChatGPT clients
      |
      | MCP / HTTPS
      v
Harness Control Plane
      |
      v
Runtime Adapter
  |       |      |
Hermes  OpenClaw  Pi  ...
```

The control plane owns identity, task/session state, authorization, runtime routing, audit/usage metadata, and the stable ChatGPT-facing contract. Harness-specific behavior stays behind adapters.

## Project truth

Before substantive work, read:

1. [`PROJECT.md`](PROJECT.md)
2. [`STATE.md`](STATE.md)
3. [`ROADMAP.md`](ROADMAP.md)
4. [`ARCHITECTURE.md`](ARCHITECTURE.md)

Detailed decisions, integrations, product paths, and implementation plans live under [`docs/`](docs/).

## Current focus

The first implementation target is Hermes. The immediate milestone is to verify the real Hermes remote-control/session surface and prove an end-to-end ChatGPT → control plane → Hermes task flow without coupling the platform to Hermes internals.
