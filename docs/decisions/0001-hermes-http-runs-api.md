# ADR 0001: Use Hermes HTTP Runs API for M1

## Status

Accepted for M1.

## Decision

Use Hermes' documented API-server HTTP runs surface as the first runtime transport. Keep the core interface independent of HTTP, SSE, Hermes Python modules, and filesystem layout.

## Evidence

- [Hermes programmatic integration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md) identifies the API server as the language-agnostic HTTP path and lists the run endpoints.
- [Hermes API server documentation](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md) documents run submission, polling, SSE events, stop, approval, sessions, auth, and capability discovery.
- [Current Hermes source](https://github.com/NousResearch/hermes-agent/blob/main/gateway/platforms/api_server.py) declares the same endpoint surface.

## Consequences

The adapter can be tested with a local Hermes server and can preserve stable run/session IDs across requests. It must not imply that a local HTTP API key is a Nous Portal OAuth token or that the API server provisions a cloud agent.
