## Roadmap alignment

- **Milestone:** M0 / M1 / M2 / M3 / M4 / M5 / V2+
- **Surface:** consumer web / Hermes API / Nous Portal / identity / provisioning / infrastructure / future channel
- **Capability advanced:**
- **Blocks/unblocks:**

## Upstream-first check

- **Relevant Hermes/Nous capability already available:**
- **Verified gap requiring custom code:**
- **Why the proposed product-owned state/service is minimal:**
- **Temporary infrastructure or debt:**
- **Production replacement/removal path:**

## What changed

Describe the behavior and files changed.

## Acceptance criteria

- [ ] Relevant roadmap gate/observable behavior is identified.
- [ ] Existing Hermes/Nous capability was checked before custom infrastructure was added.
- [ ] Unsupported or unverified capabilities are reported explicitly rather than fabricated.
- [ ] Credentials/secrets are not committed, logged, sent to browser code, or returned to model context.
- [ ] User/isolation boundaries are preserved where applicable.
- [ ] Relevant tests/validation pass.
- [ ] Real-Hermes end-to-end behavior was verified when possible, or the unverified external portion is explicitly documented.
- [ ] `STATE.md` was updated if verified project reality changed.
- [ ] An ADR was added if this changes a long-lived architecture decision.

## Validation

```text
<commands/tests/manual E2E evidence>
```

## Remaining risks / blockers

List anything still simulated, unverified, account-dependent, or dependent on external infrastructure.
