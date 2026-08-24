## Roadmap alignment

- **Milestone:** M0 / M1 / M2 / M3 / M4 / M5 / M6 / M7
- **Surface:** shared / private / public / harness adapter / infrastructure
- **Capability advanced:**
- **Blocks/unblocks:**

## End-state compatibility

- **Uses the shared control-plane/runtime-adapter boundaries:** Yes / No / N/A
- **Creates private-only logic that must later be rewritten for publication:** Yes / No
- **Harness-specific coupling introduced:**
- **Temporary infrastructure or debt:**
- **Production replacement/removal path:**

## What changed

Describe the behavior and files changed.

## Acceptance criteria

- [ ] Relevant roadmap gate/observable behavior is identified.
- [ ] Unsupported runtime capabilities fail explicitly rather than being fabricated.
- [ ] Credentials/secrets are not committed, logged, or returned to model context.
- [ ] Tenant/auth boundaries are preserved where applicable.
- [ ] Relevant tests/validation pass.
- [ ] End-to-end behavior was verified when this changes an E2E path, or the unverified portion is explicitly documented.
- [ ] `STATE.md` was updated if verified project reality changed.
- [ ] An ADR was added if this changes a long-lived architecture decision.

## Validation

```text
<commands/tests/manual E2E evidence>
```

## Remaining risks / blockers

List anything still mocked, unverified, account-dependent, or dependent on external infrastructure.
