# ADR 0005 — Control the Harness Runtime Boundary for M1

Status: Accepted

Date: 2026-08-26

## Context

M1 originally treated an existing Nous-managed Hermes Cloud instance as the presumed fastest backend. Live verification showed that the managed agent itself could be healthy while the public dashboard hostname still could not serve as an `API_SERVER_KEY`-authenticated machine origin: a human-facing Nous OAuth gate processed the Authorization header before Hermes and rejected the opaque API key. The authenticated managed-Cloud surface exposed no separate supported machine API hostname or origin-side execution path during the investigation.

This was a hosting-boundary failure, not a failure of Hermes' API-server design. Current official Hermes documentation independently supports running the API server directly and running Hermes in Docker with persistent state and configurable network binding.

The product thesis does not require Nous to host the Hermes process. It requires a normal user to reach a capable Hermes agent without seeing infrastructure setup.

## Decision

For M1, run the official Hermes runtime on infrastructure controlled by the product operator.

The initial deployment should be the smallest practical persistent VM/container host. Hermes remains authoritative for execution, sessions, memory, tools, skills, approvals, model/provider routing, and other native runtime semantics.

The product operator owns only the infrastructure required to operate that harness safely:

- process/container deployment;
- persistent Hermes data;
- secret injection;
- health/restart policy;
- restricted machine-to-machine ingress;
- recovery/rollback necessary for the hosted process.

The consumer web surface talks to Hermes through the thin server-side connector. Browser clients never receive `API_SERVER_KEY` or provider credentials.

Nous Portal may continue to provide Hermes model/tool authentication and provider access. Nous-managed Hermes Cloud is not required for M1 and is not on the critical path. It may be revisited if a supported machine-ingress contract becomes available.

## Non-decision

This ADR does **not** authorize a generic multi-harness scheduler, fleet manager, custom task engine, mirrored runtime database, or public multi-user provisioning platform.

M1 operates one Hermes runtime first. Lifecycle automation is introduced later only when the user journey proves what must be automated.

## Security constraints

- Do not expose the raw Hermes API port openly to the Internet without an additional restricted ingress policy appropriate to the host.
- Keep Hermes' own `API_SERVER_KEY` authentication enabled.
- Keep provider/Portal credentials server-side.
- Persist only harness-native data required by Hermes and product-owned data justified elsewhere.
- Do not emulate human dashboard OAuth sessions as machine credentials.

## Consequences

- M1 is no longer blocked on managed Hermes Cloud machine ingress.
- We accept minimal cloud/runtime operations as part of hiding infrastructure from users.
- The runtime host is replaceable and should not leak into consumer-facing domain concepts.
- Hermes remains upstream and authoritative even though we operate its process.
- M2/M3 may automate provisioning only after M1 produces concrete lifecycle/isolation requirements.
- The support request for managed Hermes Cloud ingress becomes optional follow-up rather than a blocker.

## M1 acceptance test

A protected mobile/desktop web client must complete a real Hermes task through the product connector against the operator-controlled Hermes runtime, and expected Hermes state must survive a runtime restart without exposing infrastructure administration to the user.

## References

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
