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
- Existing plugin `plugins_6abe73ee60b0819186f4c0932f1745d2` was updated in place to PRIVATE / USER version 0.2.1, release `pluginrel_6ac84d5ae8c88191aaf76207649c146d`. Source read-back preserves the M1 prompt and the stable hosted Vercel MCP connection. No new plugin or public publication was created.
- Both portable and legacy MCP configurations contain only the remote HTTPS Streamable HTTP endpoint. No `.app.json`, app binding, stdio command, or local app dependency is present. The 0.2.1 update fixes the interface subtitle's documented length limit; the backend retains its normalized legacy MCP configuration.
- The web plugin page still launches the desktop app. The private plugin is absent from the web Chat/Work picker. The account menu directly shows Plus and Personal account.
- OpenAI [documents](https://help.openai.com/en/articles/20001504-importing-and-syncing-plugin-marketplaces-from-github) that imported MCP declarations can receive Desktop only even for remote HTTPS servers; adding an app reference does not remove the label. Extension availability is also separate from Desktop only restrictions, according to [Plugins in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt).
- OpenAI's current [developer-mode documentation](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) places full custom MCP web write support in Business, Enterprise, and Edu workspaces. This personal Plus account is outside that documented route. Package metadata offers no supported override. A plan/workspace or platform capability change is required for that web path while retaining the requested tools.
- Updated-plugin M1 status/action, native creation, arithmetic, terminal execution, memory, negative/secret tests, and managed-agent restart acceptance remain pending.
- No M1 canary action has been invoked in this M2 live run.

## Spending and review limits

- The operator approved at most $1 of existing Nous credit for the pending terminal proof, with no purchase or overrun. Approval does not authorize resubmitting an uncertain command.
- No paid-model switch or paid-model request has been made. The native export estimates the free session's inference cost as zero; actual recorded cost is unavailable. Existing hosting charges are not attributed to inference proof here.
- Prior independent-review caps were reached: 12 Luna passes and 5 Sol passes. Subsequent Luna work is bounded diagnosis/implementation, reviewed and tested by the lead; it is not reported as an additional independent CLEAN review.

## Business custom MCP app checkpoint — October 9, 2026

The current acceptance target is the existing ChatGPT Business custom MCP app **ChatGPT Harness** (`plugin_asdk_app_6ac86a15496481919e125f50d9a9c60b`), as directed for this run. It is distinct from the private USER-scope plugin release above. No duplicate app was created, and no workspace-wide publication or availability change was made.

- At the live refresh, PR #8 is OPEN and DRAFT at `dad27d214085590c9db0461ed224a799a5b1159b`. Exact-head GitHub Actions run [37884862880](https://github.com/davidlifschitz/ChatGPTHarnessPlugin/actions/runs/37884862880) and the combined commit status are successful. The stable alias maps to READY deployment `dpl_7mDqrtgRYubjYZYa4MRa2kvGhidw`, whose deployed Git SHA is that same head. It supersedes the earlier alias target `dpl_4r1Wq2NwLLfEoS5tkzP89Xhqb5zF`. The latest runtime-changing source is `43027acac53fed05648666c656a3f6bb27a6aaca`; `dad27d2` and this evidence refresh contain documentation changes only.
- Anonymous `GET /mcp` returned the adapter's expected `401` OAuth challenge. The OAuth authorization-server and protected-resource metadata endpoints returned `200`; this is evidence that the current endpoint is not intercepted by Vercel SSO. It does not establish authenticated MCP access.
- The installed user app page calls it a Workspace plugin and offers Connect. Settings show dev mode and OAuth support. Admin shows Tools 0 / “No tools found”; workspace permission, new-tool enablement, connection-creation, and site-visitor controls are disabled. Review/Configure dialogs remain at “Loading app configuration…” with disabled Publish/Save. The earlier availability Disabled / installation Unavailable observation is not evidence that current-user-only use is impossible: that remains unverified while OAuth is incomplete. No connection, review approval, visibility change, or publication was made during this refresh.
- The user approved the displayed connection disclosure that relevant chats and memories may be shared with this app, and that app data may be used for proactive suggestions if Memory is enabled. The earlier Connect attempt reached “Waiting for operator approval” for request `OUGosGM4g2em8E1WoKk03w`. Its current pending/expired state remains unverified; no duplicate Connect attempt was made. No OAuth code, token, cookie, or chat data was recorded.
- Official Vercel CLI 63.1.0 login succeeded for `davidlifschitz`; read-only identity/project checks verified team `team_SXGTIEotIgtzIlhv1EsXxYdN` and project `prj_oAdqLtrMfAwrffyEAD9S4rf4STKw`. The branch-scoped operator variable is a write-only Secret. The prior secure metadata check stopped at `HTTP 0 sanitized_error:operator_token_is_write_only`, before any Secret-value read or protected operator call. Current presence-only checks find no original operator token in the checked process. No Secret was decrypted, exported, rotated, or replaced; no Vercel configuration or deployment was changed.
- Protected operator lookup and approval have not been called. OAuth, authenticated five-tool discovery, ChatGPT invocation, and Hermes execution through this Business app remain blocked. A trusted environment holding the original token must perform `GET /api/operator/requests?request_id=OUGosGM4g2em8E1WoKk03w`. Only if pending, send exactly one JSON `POST /api/operator/approve` with `{"request_id":"OUGosGM4g2em8E1WoKk03w"}`. Both use the existing Bearer credential; never record its value. The implementation expires pending requests after 15 minutes and atomically approves only unexpired pending records. Confirm expiry before one fresh Connect attempt.
- The user's safe reply to the protected-action request was `operator_token_unavailable_in_this_environment; request_not_checked; no_approval_post_sent`. No available trusted token-holding execution environment has been established. The request remains unreconciled; no new Connect attempt is authorized until status is known.
- Nous Portal currently shows plan Plus, `$17.68` available balance, and the existing `Fair-dinkum Esky` agent ONLINE / Running / Healthy. No Hermes task, paid-model request, purchase, or restart/update was performed. The earlier Update notice described preserved data; the actual action must be rechecked after a Business-app proof session exists.

Next unblock: the original credential holder performs the protected lookup and, if pending, approval in a trusted environment. CLI login alone cannot read back a saved Secret. After OAuth completes, verify the authenticated five-tool inventory and continue only if current-user-only app use is available without workspace publication. No Business-app session, completion, tool-call/result correlation, or M1 receipt exists yet.

### Business-app acceptance matrix at this refresh

| Test | Result | Evidence |
| --- | --- | --- |
| 1. M1 read | BLOCKED | No Business-app invocation; OAuth incomplete. |
| 2. Native session | NOT TESTED | No Business-app proof session created. |
| 3. Arithmetic | NOT TESTED | No Business-app `m2-minimal-turn` submitted. |
| 4. Terminal proof | NOT TESTED | No Business-app `m2-tool-proof` submitted; earlier direct proof remains separate. |
| 5. Memory | NOT TESTED | Requires the same Business-app proof session. |
| 6. Invalid session | NOT TESTED | No Business-app invocation. |
| 7. Authorization/secrets | BLOCKED | Anonymous initialize receives OAuth 401 and metadata 200; the ChatGPT secret-boundary check is not run. No Hermes ticket was requested by the anonymous test, based on the auth-first code path; runtime ticket evidence was not inspected. |
| 8. Reconnect/restart | NOT TESTED | No connected Business app/proof session; agent was not restarted. |
| 9. M1 action | NOT TESTED | No Business-app canary action or receipt; exactly-once action remains unspent. |
| 10. No-plugin control | PASS | Preserve recorded actual ChatGPT `551`, conversation `6ac81022-9fe8-83ea-b461-0e0a9d3ec90f`; not rerun. |

### Delegation and review ledger for this refresh

| Task | Actual model / effort | Result | Lead disposition |
| --- | --- | --- | --- |
| OAuth/operator path | GPT-6 Luna / Extra High | Read-only contract and local token-presence audit; no token available in checked processes. | Source/test evidence checked; approval is authorized but blocked on credential availability. |
| Business app state | GPT-6 Luna / Extra High | Installed Connect/dev/OAuth UI and zero-tool admin state; private usability unverified. | Accepted with uncertainty retained; no publication or enablement. |
| CI/deployment | GPT-6 Luna / Extra High | Exact-head CI, deployment/alias, anonymous 401, metadata 200. | Accepted as backend evidence only. |

No implementation changes or formal new Luna High/Sol Medium implementation review passes occurred. The prior applicable implementation reviews remain historical; these three read-only audits do not replace live acceptance. Operator replay/expiry behavior is supported by source; the bounded audit noted no explicit duplicate-approval or expired-pending assertion in the inspected operator test. This refresh does not claim additional test coverage or a new clean full-security review.
