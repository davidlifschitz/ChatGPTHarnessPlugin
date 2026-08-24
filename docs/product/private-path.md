# Private / Canary Path

Purpose: validate the real system quickly without creating a throwaway architecture.

## Uses

- owner dogfooding,
- protocol verification,
- early MCP/Apps SDK testing,
- canary releases,
- destructive/failure testing,
- staging/admin workflows.

## Allowed simplifications

Private infrastructure may use simpler deployment or authentication while the system is pre-production, but only behind the same shared service/runtime boundaries used by the published product.

## Not allowed

- private-only task/session business logic,
- a separate Hermes-specific control plane,
- secrets in prompts or source,
- client-owned durable task state,
- relying on unsupported runtime capabilities.

## Exit condition

By M4 this path becomes the staging/canary channel for the same backend used by the published/stable path.
