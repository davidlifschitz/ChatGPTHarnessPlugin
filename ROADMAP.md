# ChatGPTHarnessPlugin — Roadmap

This roadmap sequences the shared product from architecture through a published first harness integration, then proves multi-harness portability.

## M0 — Product Architecture and Repository Foundation

**Goal:** establish the product boundary, source of truth, roadmap, architecture rules, and development governance.

**Gate:**
- canonical product repo exists,
- `PROJECT.md`, `STATE.md`, `ROADMAP.md`, `ARCHITECTURE.md` exist,
- private/public convergence and adapter boundaries are documented,
- product work no longer lives conceptually inside a harness source fork.

## M1 — Hermes Runtime Adapter

**Goal:** prove that the shared platform can control one real general-purpose harness through a stable adapter.

**Work:**
- verify actual Hermes remote execution/session interfaces,
- verify Nous Portal/Hermes Cloud lifecycle capabilities,
- define shared runtime capability model,
- implement Hermes adapter,
- normalize errors and unsupported capability behavior,
- prove task start/status/result and lifecycle operations that the runtime truly supports.

**Gate:** a programmatic client can invoke a real Hermes runtime through the shared adapter boundary and observe a real result without relying on fabricated or unverified APIs.

## M2 — Private ChatGPT Control

**Goal:** control Hermes from ChatGPT through the shared control plane.

**Work:**
- implement the shared task/session service,
- expose a minimal MCP/Apps SDK-compatible tool contract,
- support task start/status/result/continue/cancel/approval where supported,
- deploy a private/canary environment,
- exercise failure cases and runtime restarts.

**Gate:** ChatGPT → product MCP/API → control plane → Hermes → result works end-to-end in the private environment.

## M3 — Production Identity and Isolation

**Goal:** make the backend production-shaped for multiple users/tenants.

**Work:**
- user and tenant domain model,
- production authentication,
- Nous account/org linkage where applicable,
- tenant-scoped runtime/session/task ownership,
- policy/approval enforcement,
- secret storage boundary,
- audit and usage events.

**Gate:** two test identities cannot access each other's runtimes, tasks, sessions, approvals, or credentials.

## M4 — Private/Public Convergence

**Goal:** eliminate architectural divergence between dogfood and publish paths.

**Private channel becomes:** staging, canary, admin, protocol testing.

**Public channel becomes:** stable production distribution.

**Shared by both:**
- control-plane services,
- runtime adapters,
- task/session engine,
- auth/tenant model,
- persistence contracts,
- policy/approval layer,
- audit/usage model,
- MCP/domain schemas,
- automated tests.

**Gate:** no core business logic exists only in the private or public client layer.

## M5 — Release Candidate

**Goal:** harden the shared product for public use.

**Work:**
- retries, idempotency, timeouts, cancellation, health checks,
- rate limits and abuse controls,
- observability and safe logging,
- production error UX,
- privacy/retention documentation,
- security review,
- regression and E2E suites,
- deployment and rollback procedures.

**Gate:** the first eight core journeys work reliably: connect, list/select runtime, start, submit task, inspect progress/result, continue, cancel, and stop/destroy where supported.

## M6 — Publish First Harness Plugin

**Goal:** publish the first supported ChatGPT harness integration, initially Hermes.

**Work:**
- production ChatGPT app/plugin package,
- metadata and onboarding,
- OAuth/domain configuration,
- submission tests and negative tests,
- privacy/terms/support material,
- directory submission and review fixes.

**Gate:** a normal supported user can install/connect the published product and use Hermes without understanding the underlying infrastructure.

## M7 — Prove Second Harness Adapter

**Goal:** prove the architecture is genuinely harness-agnostic.

**Candidate:** OpenClaw, Pi, or another harness selected based on current capabilities and user value.

**Rule:** do not build the second adapter merely to satisfy abstraction aesthetics. The second harness must provide a meaningful capability or deployment advantage.

**Gate:** the second harness works through the same task/session/control-plane contracts with no forked product backend.

## Development sequencing rule

Do not expand horizontally into many harnesses before M6 unless a second harness is necessary to resolve a concrete product requirement. Hermes-first is an implementation sequence, not a permanent coupling.
