# Historical Channel Note — ChatGPT

Status: **Promoted to V1 by ADR 0006 on 2026-09-30**

This file is retained so the repository preserves the decision history that previously deferred ChatGPT to V2+.

That deferral is no longer active.

## Current decision

ChatGPT plugin/MCP is the primary V1 consumer channel.

The current path is:

```text
ChatGPT Plus developer mode
  -> personal plugin
  -> deployed HTTPS MCP service
  -> Hermes adapter
  -> Hermes runtime
```

After the private path and multi-user isolation are proven, the plugin is packaged and submitted for public distribution.

See:

- `../../PROJECT.md`
- `../../ROADMAP.md`
- `../../ARCHITECTURE.md`
- `../decisions/0006-chatgpt-plugin-primary-channel.md`

## Why the old decision changed

OpenAI now documents full MCP read/write support in ChatGPT developer mode for Plus and Pro, personal plugin testing, and public plugin distribution through the universal directory.

Sources:

- https://developers.openai.com/chatgpt
- https://developers.openai.com/plugins/quickstart
- https://developers.openai.com/plugins/deploy/submission
