# Future Channel — ChatGPT

Status: Deferred to V2+

ChatGPT may become a distribution channel after the standalone consumer web product is working and production-shaped.

## V1 rule

Do not introduce GPT, GPT Action, Apps SDK, MCP, plugin-publication, or ChatGPT-specific state into V1 architecture.

## Future integration principle

A future ChatGPT client should reuse the same consumer identity/entitlement boundary and supported Hermes APIs that power the standalone product. It should remain a thin channel adapter rather than become the owner of agent state or infrastructure credentials.

## Re-entry criteria

Resume this work only after:

1. a real Hermes browser experience works end-to-end;
2. multi-user identity/isolation is understood;
3. production credential mediation exists if required;
4. the value of a ChatGPT channel outweighs current platform/distribution constraints.

When this channel is restarted, re-check current OpenAI product/API capabilities rather than relying on old assumptions.