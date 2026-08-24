# ChatGPTHarnessPlugin — Architecture

This document contains the long-lived architecture constraints for the product. For current implementation reality, see `STATE.md`. For sequencing, see `ROADMAP.md`.

## Objective

Provide a stable, cloud-hosted control plane that lets ChatGPT delegate work to general-purpose agent harnesses without coupling the product to one harness, one hosting provider, one developer-only path, or harness-internal classes/file layouts.

## System shape

```text
ChatGPT web / mobile / desktop / Codex
                  |
                  | MCP / HTTPS
                  v
          Harness Control Plane
  ┌──────────────────────────────────┐
  │ authentication / tenants         │
  │ runtime registry                 │
  │ task router                      │
  │ session manager                  │
  │ policy / approvals               │
  │ persistence                      │
  │ audit / usage                    │
  │ reliability / observability      │
  └───────────────┬──────────────────┘
                  |
            Runtime Adapter
         ┌────────┼────────┐
         v        v        v
       Hermes  OpenClaw    Pi   ...
         |
         ├─ Nous Portal / Hermes Cloud lifecycle where useful
         └─ Hermes execution/session transport
```

## Core boundaries

### ChatGPT client boundary

ChatGPT receives the tool contracts and user-visible state needed to operate the product. It must not own durable runtime state, credentials, tenant authorization, routing, or infrastructure secrets.

### Control-plane boundary

The control plane owns durable product state and authorization. Domain operations should remain harness-neutral where practical:

```text
runtimes.list
runtimes.get
runtimes.create
runtimes.start
runtimes.stop
runtimes.restart
runtimes.destroy

sessions.list
sessions.get
sessions.create

tasks.start
tasks.get
tasks.result
tasks.continue
tasks.cancel

approvals.list
approvals.respond
```

The ChatGPT-facing MCP surface may expose a smaller, user-oriented subset.

### Runtime adapter boundary

Each harness implements a capability-driven contract. Initial target shape:

```text
capabilities()
health()
start_run(request)
get_run(run_id)
get_result(run_id)
continue_session(session_id, instruction)
approve(run_id, approval)
stop_run(run_id)
```

Lifecycle provisioning may be a separate adapter when the harness execution transport and hosting lifecycle are different systems.

A harness may not support every capability. Unsupported operations must return explicit normalized errors rather than being simulated or fabricated.

## Hermes adapter

Hermes is adapter #1. The adapter may combine:

- Nous Portal/Hermes Cloud for account/org-aware discovery and lifecycle where supported,
- the supported Hermes remote runtime/session transport for actual task execution,
- local/self-hosted Hermes connection profiles where useful.

The rest of the product must not depend on Hermes-specific endpoint names, Python classes, config paths, or CLI file structure.

## Other harnesses

OpenClaw, Pi, and future harnesses should be added only when there is concrete value. They implement the same domain intent through their own adapter-specific capability maps.

The architecture does not require identical harness semantics. The capability model should expose meaningful differences instead of forcing false equivalence.

## Long-running tasks

Agent work is represented by durable server-side task/run state. A task submission should return a stable identifier quickly:

```json
{
  "task_id": "tsk_123",
  "state": "running"
}
```

Clients inspect, continue, approve, or cancel work through explicit operations. Arbitrary agent work must not require one ChatGPT tool invocation or HTTP connection to remain open for its full duration.

## Identity and tenancy

Production-owned state is tenant scoped:

```text
user
→ tenant / external organization linkage
→ runtime connection
→ session
→ task
→ approval / audit / usage
```

Tenant identity is derived from verified authentication, never trusted from a client-provided tool argument.

## Secrets

Secrets are stored and used server-side.

Never:

- commit credentials,
- place tokens in prompts,
- return tokens in tool results,
- log raw bearer/refresh tokens,
- trust client-provided tenant IDs as authorization.

Private development may use simpler authentication only behind the same service boundary so production auth can replace it without rewriting runtime/task logic.

## Private/public convergence

Private and public delivery paths are deployment/configuration channels, not separate products.

By M4 they share runtime adapters, task/session engine, persistence contracts, policy/approval logic, auth/tenant domain model, audit/usage model, tool schemas, and tests.

Allowed differences include domains, client IDs, configuration, rate limits, feature flags, canary versions, and operational access.

## Function-agnostic model

The product must not assume that an agent is a coding agent. Tasks may represent software development, research, marketing, SEO, sales, browser operations, productivity, analysis, or other work.

Harness-specific capabilities can be richer than the common contract, but the shared product model should remain useful without hardcoding one occupational role.

## Infrastructure boundary

Cloudflare or another edge provider may supply DNS, TLS, tunneling, WAF, rate limiting, and origin protection. Edge infrastructure is not the control plane and should be replaceable.

Likewise, a VPS/container host is a deployment target rather than part of the product domain model.

## Normalized errors

Prefer stable product errors over leaking raw upstream details. Examples:

- `RUNTIME_UNAVAILABLE`
- `AUTH_REQUIRED`
- `AWAITING_APPROVAL`
- `POLICY_DENIED`
- `PLAN_LIMIT_REACHED`
- `INVALID_RUNTIME_CONFIG`
- `UNSUPPORTED_CAPABILITY`
- `RUNTIME_ERROR`

Adapter-specific details may be attached for diagnostics without exposing secrets.

## Source-of-truth hierarchy

When artifacts disagree:

1. verified code/runtime behavior,
2. `STATE.md`,
3. accepted ADRs and this architecture document,
4. `ROADMAP.md` / `PROJECT.md`,
5. detailed implementation plans,
6. conversation history or memory.
