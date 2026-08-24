# Release Requirements

This checklist applies before the first public harness plugin/app is considered release-ready.

## Core user journeys

1. Connect/authenticate the relevant account/runtime provider.
2. Discover/select an available runtime or agent.
3. Start/provision where supported.
4. Submit a task.
5. Inspect status/progress/result.
6. Continue the same session.
7. Approve/deny consequential actions where required.
8. Cancel/stop/destroy safely where supported.

## Security

- production authentication and authorization,
- tenant isolation tests,
- server-side secret storage,
- no secrets in prompts/logs/tool results,
- correct destructive/open-world annotations,
- confirmation/approval policy,
- rate limits and abuse controls,
- retention/deletion policy.

## Reliability

- idempotency for retryable mutations,
- timeouts,
- task cancellation,
- runtime health/reconnect handling,
- durable task/session identifiers,
- normalized errors,
- audit trail,
- production observability,
- rollback procedure.

## ChatGPT packaging

- stable MCP endpoint,
- production OAuth/domain configuration where required,
- app/plugin metadata,
- icons/screenshots/sample prompts as required,
- privacy policy,
- terms/support information,
- submission test cases,
- negative/destructive-action test cases.

## Evidence rule

A checked item requires fresh evidence. Mock-only tests do not prove external runtime/account integration works. `STATE.md` must distinguish implemented, tested against fakes, and live-verified behavior.
