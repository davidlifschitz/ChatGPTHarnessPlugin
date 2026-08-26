# Documentation Index

The root documents define product truth:

- `../PROJECT.md` — end goal and development invariants.
- `../STATE.md` — verified current reality.
- `../ROADMAP.md` — milestones and gates.
- `../ARCHITECTURE.md` — long-lived architecture.

Supporting documentation:

- `decisions/` — architecture decision records (ADRs).
- `integrations/` — verified current facts and constraints for Hermes, Nous Portal, Cloudflare, and other active upstream dependencies.
- `product/` — current consumer-product requirements and experiments.
- `future-channels/` — deferred distribution channels such as ChatGPT.
- `implementation/` — implementation material tied to current roadmap milestones.
- `superpowers/specs/` and `superpowers/plans/` — approved design and implementation-plan artifacts.

## Current rule

V1 is upstream-first. A proposed custom service or state model must identify the consumer requirement it serves and the verified Hermes/Nous gap that requires it.

Detailed plans do not override observed runtime behavior, authoritative current upstream documentation, or `STATE.md`.