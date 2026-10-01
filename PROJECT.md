# ChatGPT Harness Plugin — Project Overview

This repository is the canonical source of truth for a ChatGPT-native consumer distribution layer over general-purpose agent harnesses.

## End goal

A normal user should be able to stay inside ChatGPT and say things like:

- "start an agent to research this";
- "continue the agent I was using yesterday";
- "show me what my agent is doing";
- "stop that run";
- "hand this task to my Hermes agent."

The user should not need to understand which harness, model provider, cloud host, MCP server, container, tunnel, API key, or runtime process is underneath.

The customer experiences an agent capability inside ChatGPT, not infrastructure administration.

## DevDay 2026 reset

The previous project plan made a standalone mobile-friendly web app the V1 distribution channel and deferred ChatGPT to V2+.

That sequencing is no longer current.

OpenAI now documents:

- full read/write MCP support in ChatGPT developer mode for Plus and Pro;
- personal plugin testing by connecting a deployed HTTPS MCP endpoint;
- plugin packages containing skills, MCP servers, or both;
- public submission to a universal plugin directory shared by ChatGPT and Codex;
- OAuth 2.1 for authenticated MCP servers.

Sources:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/auth

Therefore **ChatGPT becomes the primary V1 user surface**.

A ChatGPT Plus account is sufficient for the documented developer-mode MCP testing path. Public submission additionally requires the applicable OpenAI developer identity/review requirements; it does not make ChatGPT Business a prerequisite for this project's MVP.

## Harness strategy

The product is multi-harness by design and sequential by implementation.

- **Hermes is the MVP harness.** Its API server exposes chat, sessions, runs, control, capability discovery, skills/toolsets, and memory scoping.
- **OpenClaw is the planned second harness.** It validates the adapter boundary against a materially different runtime.
- Additional harnesses are added only for concrete user value.

Do not delay Hermes to solve hypothetical cross-harness abstractions.

## Product boundary

The durable product boundary is the public HTTPS MCP service used by the ChatGPT plugin.

The plugin package may contain:

- skills/instructions for repeatable workflows;
- the MCP server declaration;
- optional UI later if a workflow benefits from it.

The MCP service may own shared product concerns such as:

- end-user authentication and authorization;
- user-to-harness/runtime mapping;
- safe goal-level tool definitions;
- harness connection configuration;
- product permissions/entitlements where needed;
- simplified errors and confirmations;
- later billing/product analytics if justified;
- event delivery/automation when justified.

Each harness remains authoritative for its own runtime semantics and durable agent state.

## Runtime strategy

Harness software and harness hosting are separate decisions.

For Hermes, the product needs a machine-accessible API origin that the MCP server can reach safely. The official Hermes API server requires bearer authentication and binds to loopback by default.

Sources:

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration

The documented Nous Portal MCP endpoint manages Hermes Cloud instance lifecycle. It does not, in its documented tool surface, provide the session/chat API required by this product:

- https://hermes-agent.nousresearch.com/docs/guides/manage-hermes-cloud-with-mcp

Accordingly, ADR 0005's operator-controlled runtime option remains valid until a supported managed-cloud machine ingress for Hermes chat/session control is verified.

## Sign in with ChatGPT and Hermes

OpenAI currently lists Hermes Agent as a participating app for eligible Plus/Pro ChatGPT plan usage:

- https://learn.chatgpt.com/docs/sign-in-with-chatgpt

Treat that as a potentially useful provider/auth simplification inside Hermes.

Do **not** treat it as proof that ChatGPT can directly reach a Hermes runtime, or as a substitute for the plugin MCP transport. Those are separate integration boundaries unless verified otherwise.

## Plugin tool philosophy

Expose user outcomes, not an internal API dump.

The first tool surface should stay small and may cover:

- agent/session discovery;
- starting work;
- sending/continuing work;
- status/output retrieval;
- stopping active work.

OpenAI's guidance:

- https://developers.openai.com/plugins/plan/tools

## Authentication strategy

Development:
- connect the deployed MCP endpoint as a personal plugin in ChatGPT developer mode.

Public/multi-user:
- use MCP OAuth 2.1;
- verify authorization on every server request;
- scope each tool call to the authenticated user;
- keep harness/provider secrets server-side.

Source:

- https://developers.openai.com/plugins/build/auth

## Standalone web strategy

The existing Vercel web surface is retained as a validation/admin tool, not as the default consumer distribution channel.

Build a standalone consumer frontend only if a verified plugin limitation or product requirement justifies it.

## Development rules

1. ChatGPT is the primary V1 user surface.
2. A Plus personal-plugin proof comes before public distribution work.
3. Verify upstream harness capabilities before designing replacements.
4. Separate harness choice from hosting-provider choice.
5. Keep harness/provider secrets server-side.
6. Prefer harness-native sessions, runs, memory, tools, skills, approvals, and model routing.
7. Keep harness-specific transport behind the smallest practical adapter seam.
8. Do not build a generic multi-harness control plane.
9. Do not generalize the adapter beyond evidence from implemented harnesses.
10. Hermes ships first; OpenClaw follows after the Hermes plugin path works.
11. Use OAuth 2.1 for authenticated public MCP access.
12. Destructive or hard-to-reverse actions require explicit safe tool semantics/confirmation.
13. Update `STATE.md` only with verified reality.
14. Long-lived architecture changes require an ADR.
15. Treat the old Vercel consumer UI as diagnostic/admin infrastructure unless a future ADR promotes it again.

## Current milestone

**M1 — Plus Personal Plugin Proof**

Prove that ChatGPT developer mode on Plus can invoke our own deployed HTTPS MCP server and complete both a read tool and a controlled write/action tool. Then connect that same MCP boundary to a real Hermes runtime.
