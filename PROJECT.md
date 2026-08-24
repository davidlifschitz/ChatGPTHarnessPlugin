# ChatGPT Harness Plugin

This repository is the product-side control plane boundary for connecting ChatGPT to agent runtimes. M1 implements the first runtime adapter for Hermes Agent.

## Scope

- Provide a harness-neutral runtime contract with stable runtime, session, and run identifiers.
- Connect to a running Hermes API server through its documented HTTP runs API.
- Keep Hermes/Nous lifecycle management separate from task execution.
- Keep secrets in runtime configuration only; never commit or print credentials.

## Out of scope for M1

- ChatGPT marketplace UX, billing, public multi-user OAuth, and deployment.
- OpenClaw or Pi adapters.
- Hermes source changes or a dependency on Hermes private Python classes.

The product repository is the source of truth. `davidlifschitz/hermes-agent-grok` and `NousResearch/hermes-agent` are reference/runtime repositories only.
