# Documentation Index

The root documents define product truth:

- `../PROJECT.md` — end goal and development invariants.
- `../STATE.md` — verified current reality.
- `../ROADMAP.md` — milestones and gates.
- `../ARCHITECTURE.md` — long-lived architecture.

Supporting documentation:

- `decisions/` — architecture decision records (ADRs).
- `integrations/` — verified current facts and constraints for OpenAI plugins, Hermes, Nous Portal, Cloudflare, OpenClaw, and other active upstream dependencies.
- `product/` — current consumer-product requirements and experiments.
- `future-channels/` — historical/deferred channel notes. ChatGPT has been promoted from this category to the primary V1 surface by ADR 0006; the old path is retained only for decision history.
- `implementation/` — implementation material tied to current roadmap milestones.
- `superpowers/specs/` and `superpowers/plans/` — design and implementation-plan artifacts that may predate the latest ADRs.

## Current rule

V1 is **ChatGPT-plugin-first and upstream-harness-first**.

A proposed custom service or state model must identify:

1. the ChatGPT/plugin user outcome it serves;
2. the verified gap in ChatGPT or the selected harness that requires custom code;
3. why the behavior cannot stay authoritative in the harness.

Detailed plans do not override observed runtime behavior, authoritative current upstream documentation, `STATE.md`, or accepted ADRs.
