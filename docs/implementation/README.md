# Implementation Plans

Detailed implementation plans live here and must map to a roadmap milestone.

Each plan should state:

- milestone and capability advanced;
- exact upstream Hermes/Nous capability being consumed;
- the verified product gap, if custom code is proposed;
- files/components to change;
- acceptance criteria;
- validation commands and real-Hermes end-to-end checks;
- security implications;
- temporary infrastructure/debt and its removal path;
- remaining blockers.

Plans are working artifacts. They do not override observed runtime behavior, authoritative upstream documentation, accepted ADRs, `ARCHITECTURE.md`, or `STATE.md`.

The first implementation work is M1: verify the real Hermes Cloud API-server path and connect the least-custom viable browser frontend to it. Do not begin by scaffolding a generic control plane.