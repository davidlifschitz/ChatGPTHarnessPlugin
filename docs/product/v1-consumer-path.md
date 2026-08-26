# V1 Consumer Path

## User promise

A normal user can open the product from a phone or desktop browser, authenticate, reach their Hermes agent, and use it without seeing or managing terminals, API keys, MCP configuration, cloud-instance details, model-provider setup, or other infrastructure.

## First experiment

The first M1 implementation should use the least-custom frontend that can talk to the supported Hermes API server. Open WebUI or LobeChat are preferred starting candidates because Hermes explicitly documents OpenAI-compatible frontend support.

This experiment is production-shaped only if:

- the frontend talks to a real Hermes instance rather than a fake adapter;
- Hermes credentials stay out of browser-visible configuration;
- chat streams real tool progress where supported;
- sessions can be resumed using Hermes' supported session surface;
- user/channel memory scope uses the supported Hermes session-key mechanism where applicable;
- at least one real tool-using task succeeds end-to-end;
- all missing UX/security/product requirements are recorded before custom infrastructure is added.

## Consumer UX requirements

The ordinary-user surface should initially expose only what is needed to use the agent:

- conversation;
- conversation/session history;
- clear running/tool activity;
- recoverable errors;
- account/sign-out;
- agent selection only if the user can legitimately have more than one.

Administrative Hermes configuration should not be present in the normal flow.

## Questions M1 must answer with evidence

1. What URL/network path exposes the API server from the existing Hermes Cloud instance?
2. Can a server-side frontend/proxy authenticate to it without shipping `API_SERVER_KEY` to the browser?
3. Which existing frontend gets closest to the desired mobile UX?
4. Do its conversation semantics map cleanly to Hermes sessions?
5. How should unrelated end users be isolated: dedicated Cloud instances, Hermes profiles, or another supported boundary?
6. Which product-owned state is genuinely necessary after the above is working?

## Exit artifact

M1 ends with a real end-to-end demo plus a short gap ledger. M2 scope is generated from that ledger; it is not predetermined.