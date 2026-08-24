# ChatGPTHarnessPlugin

A product-side runtime adapter boundary for connecting ChatGPT to agent runtimes.

M1 implements a harness-neutral TypeScript contract and Hermes `hermes gateway` HTTP adapter. It supports capability discovery, safe run submission, polling, result retrieval, optional SSE observation, and explicit unsupported-capability errors. Nous Portal lifecycle and Hermes Cloud execution remain separate, documented follow-up work.

```text
npm install
npm test
npm run typecheck
npm run build
```

See [M1 implementation notes](docs/implementation/README.md), [Hermes integration evidence](docs/integrations/hermes.md), and [current state](STATE.md).
