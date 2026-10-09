# M2 live evidence — October 8, 2026

M2 is not yet GREEN. Direct adapter evidence is separate from actual ChatGPT plugin acceptance. PR #8 remains draft and must not be merged.

## Verified source and deployment

- Source: `443727b7ce78a1dbf25bd7c8e365782523aad3e9`.
- GitHub Actions: [37848372524](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/actions/runs/37848372524) and [37848377899](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/actions/runs/37848377899), both successful.
- Local validation: 106 Node tests under Node 22, 11 Python tests, JavaScript syntax and diff checks passed.
- Matching Vercel preview: `dpl_J7zRhPdEUanjo5Ka44Fy5wykRxqH`, READY. Stable alias: `hermes-consumer-layer-m1-git-m2-0159fc-davidlifschitzs-projects.vercel.app`.

## Private state and authentication

- Existing private Blob store connected only to the existing project's M2 preview branch.
- Deployed create/read, CAS contention, duplicate-create preservation, and cleanup verification passed.
- Native PKCE bootstrap completed; its local authorization process exited.
- Separate deployed invocations verified refreshed native credentials, persisted rotation, and bearer access.
- Direct MCP OAuth authorization and refresh succeeded. Exactly the five intended tools were discovered.
- Anonymous MCP requests returned 401; unrelated status/chat endpoints returned 404/410; operator access remained authenticated. Only the stable M2 alias has a Deployment Protection override.

## Native execution and reconciliation

- Managed agent: existing Fair-dinkum Esky. No second agent, purchase, or destructive lifecycle action occurred.
- Original configured model `stealth/ox-alpha` failed with a native model-not-found error. The first-party selector was changed to the listed free Nous model `stepfun/step-3.7-flash:free` for new sessions.
- Proof session: `20261008_214510_4f5165`, recovered through an independent native connection.
- Arithmetic request `m2_11a1b2cc-ee25-44c2-8bb3-ff41705725a2` completed with exactly `391` and no tool calls.
- Terminal request `m2_a0c4b085-37ef-43c0-88ff-01e6300881c5` was submitted once. A free-model capacity/rate limit exceeded the adapter's bounded wait. The command was never resubmitted while its outcome was uncertain.
- A first-party native session export subsequently proved one `terminal` invocation and a matching persisted tool-result record with the same call ID, `chatcmpl-tool-83856b35b833c66a`, in the same session and after the accepted terminal user row. Independent local comparison verified the command exactly matched the requested proof command and its actual result contained the expected SHA-256. A final assistant row followed the paired records with native `finish_reason: stop`.
- Commit `9f512be64a0bf4ddb6f32db28f646751e84543bc` passed 109 Node tests, 11 Python tests, and syntax checks; GitHub runs `37870884951` and `37870886820` passed. Matching preview `dpl_B8Dwmcgu5FRVPFa6JGyvxQp4v1AX` is READY and serves the stable alias.
- A deployed read of the original terminal request now returns `completed`, `outcome_unknown: false`, exactly one `terminal` call, and the expected hash. It recovered from the authoritative persisted receipt without resubmitting the command. A final cursor-preservation regression is being integrated before the completed-request replay check.
- The downloaded native export is held privately outside the repository. Raw arguments, results, system prompts, and configuration are not reproduced here.

## Actual ChatGPT and plugin state

- Non-plugin arithmetic control: actual ChatGPT returned `551` without tool invocation in conversation `6ac81022-9fe8-83ea-b461-0e0a9d3ec90f`.
- Existing private USER plugin remains version 0.1.0. The 0.2.0 package is prepared but not released.
- Updated-plugin M1 status/action, native creation, arithmetic, terminal execution, memory, negative/secret tests, and managed-agent restart acceptance remain pending.
- No M1 canary action has been invoked in this M2 live run.

## Spending and review limits

- The operator approved at most $1 of existing Nous credit for the pending terminal proof, with no purchase or overrun. Approval does not authorize resubmitting an uncertain command.
- No paid-model switch or paid-model request has been made. The native export estimates the free session's inference cost as zero; actual recorded cost is unavailable. Existing hosting charges are not attributed to inference proof here.
- Prior independent-review caps were reached: 12 Luna passes and 5 Sol passes. Subsequent Luna work is bounded diagnosis/implementation, reviewed and tested by the lead; it is not reported as an additional independent CLEAN review.
