# Implementation

M1 is a small TypeScript vertical slice:

- `src/types.ts` and `src/errors.ts`: harness-neutral IDs, capabilities, states, results, errors, and adapter contract.
- `src/lifecycle.ts`: local configured-runtime resolution only; cloud lifecycle is intentionally separate.
- `src/client.ts`, `src/protocol.ts`, and `src/adapter.ts`: Hermes HTTP client, SSE parsing, capability mapping, and runtime adapter.
- `tests`: unit/protocol fixtures plus an opt-in real-runtime test.

The real-runtime test must receive its endpoint/key through environment variables and must use a harmless deterministic prompt. It must not print the key or treat a fixture as E2E evidence. Reusing a `session_id` alone is correlation only; explicit history/response chaining is required for continuation.

Expected local checks are:

```text
npm test
npm run typecheck
npm run build
npm run test:e2e # only with HERMES_M1_E2E=1 and runtime-only credentials
```

The M1 E2E test uses `Reply with exactly: HERMES_M1_OK`, polls by stable run ID, and asserts the exact terminal output. It is skipped by default so ordinary tests never require credentials or a running Hermes gateway.
