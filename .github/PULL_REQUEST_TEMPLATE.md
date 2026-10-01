## Roadmap alignment

- **Milestone:** M0 / M1 / M2 / M3 / M4 / M5 / M6 / M7
- **Surface:** ChatGPT plugin / MCP service / Hermes adapter/runtime / Nous Portal / OAuth/identity / infrastructure / OpenClaw / diagnostics web
- **Capability advanced:**
- **Blocks/unblocks:**

## Native-capability check

- **Relevant OpenAI plugin/MCP capability already available:**
- **Relevant harness/Nous capability already available:**
- **Verified gap requiring custom code:**
- **Why the proposed product-owned state/service is minimal:**
- **Temporary infrastructure or debt:**
- **Production replacement/removal path:**

## What changed

Describe the behavior and files changed.

## Acceptance criteria

- [ ] Relevant roadmap gate/observable behavior is identified.
- [ ] Existing OpenAI and harness capabilities were checked before custom infrastructure was added.
- [ ] Plugin tools map to clear user outcomes rather than mechanically mirroring an internal API.
- [ ] Unsupported or unverified capabilities are reported explicitly rather than fabricated.
- [ ] Credentials/secrets are not committed, logged, placed in plugin packages/browser code, or returned to model context.
- [ ] Authorization and user/isolation boundaries are preserved where applicable.
- [ ] Relevant tests/validation pass.
- [ ] Real external behavior was verified when possible, or the unverified portion is explicitly documented.
- [ ] `STATE.md` was updated if verified project reality changed.
- [ ] An ADR was added if this changes a long-lived architecture decision.

## Validation

```text
<commands/tests/manual E2E evidence>
```

## Remaining risks / blockers

List anything still simulated, unverified, account-dependent, or dependent on external infrastructure.
