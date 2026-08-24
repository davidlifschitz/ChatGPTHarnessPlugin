# Architecture

```text
ChatGPT
  -> Harness control plane (future)
  -> HarnessRuntimeAdapter
       -> HermesRuntimeAdapter -> Hermes API server

LifecycleAdapter (separate boundary)
  -> local process/operator lifecycle or a future authenticated Nous Portal API
```

The core contract contains only runtime concepts: runtime identity, session identity, run identity, capabilities, state, result, and normalized errors. Hermes HTTP paths and wire shapes live under the Hermes adapter.

The adapter uses stable IDs and polling/event retrieval. A product request does not remain open for the whole agent turn. Hermes-specific features are advertised from `/v1/capabilities`; an absent or false capability is surfaced as `UNSUPPORTED_CAPABILITY`.

M1 does not claim that the product can provision, start, stop, restart, or destroy Hermes Cloud agents. Those are lifecycle concerns and remain separate from task/session execution until an official Nous Portal contract is verified.
