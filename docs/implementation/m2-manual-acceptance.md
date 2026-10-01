# M2 Manual Acceptance — ChatGPT -> MCP -> Hermes

Run this only after the Render Hermes runtime is healthy, the M2 Vercel Preview points to the Render bridge, and the private ChatGPT plugin points to the M2 Preview `/mcp` endpoint.

Do not record or paste `OPENAI_API_KEY`, Render's internal `API_SERVER_KEY`, `HERMES_BRIDGE_KEY`, Vercel credentials, cookies, OAuth tokens, or other secret values in acceptance evidence.

## Preflight

Required evidence before ChatGPT testing:

- Render `/health` returns HTTP 200.
- Vercel Preview `/api/status` returns `connected: true`, a model identifier, capabilities, and `sessions_api: true`.
- MCP Inspector initializes against the public M2 Preview `/mcp` URL.
- `tools/list` returns exactly:
  - `get_m1_status`
  - `run_m1_canary_action`
  - `start_hermes_session`
  - `send_hermes_task`
  - `get_hermes_session`
- repository CI is green on the tested commit.

## Test 1 — M1 read regression

Prompt:

```text
@ChatGPT Harness Plugin check the M1 service status using the plugin.
Do not start Hermes and do not run the canary action.
```

PASS:

- only `get_m1_status` is invoked;
- it still reports `ready` / `m1-canary-v1`.

## Test 2 — create a real Hermes session

Prompt:

```text
@ChatGPT Harness Plugin start one Hermes session titled "M2 manual proof".
Return the Hermes session ID.
```

PASS:

- `start_hermes_session` is invoked exactly once;
- a non-empty Hermes session ID is returned;
- the same session is readable with `get_hermes_session`.

Record the session ID as non-secret acceptance evidence.

## Test 3 — minimal real turn

Prompt:

```text
@ChatGPT Harness Plugin send this task to the Hermes session from the previous step:
"Return exactly the result of 17 * 23 and no other text."
```

PASS:

- `send_hermes_task` targets the same session ID;
- Hermes returns `391`;
- the result includes an M2 request/receipt ID;
- Vercel logs contain the same request ID without prompt text or credentials.

## Test 4 — real tool-capable Hermes turn

Use a task that forces Hermes to invoke its native terminal tool without external side effects:

```text
@ChatGPT Harness Plugin send this task to the same Hermes session:
"Use your terminal tool to run a local command that prints the SHA-256 of the exact string m2-hermes-tool-proof. Return the hash and say which tool you used."
Then inspect that Hermes session with the plugin.
```

PASS:

- the task completes through `send_hermes_task`;
- `get_hermes_session` reports at least one tool call and includes the observed terminal tool name;
- the plugin does not expose raw tool arguments, raw terminal output, environment values, or credentials;
- the user-visible final result is coherent with the tool-backed computation.

## Test 5 — session continuation

Prompt:

```text
@ChatGPT Harness Plugin continue the same Hermes session:
"What exact proof string did I ask you to hash in the previous turn?"
```

PASS:

- `send_hermes_task` uses the same session ID;
- Hermes answers `m2-hermes-tool-proof` from its persisted conversation state;
- `get_hermes_session` shows an increased message count.

## Test 6 — controlled invalid session

Prompt:

```text
@ChatGPT Harness Plugin send "hello" to Hermes session missing_m2_session.
```

PASS:

- the Hermes action fails cleanly;
- ChatGPT reports the model-readable not-found error;
- no successful M2 request receipt is invented;
- no stack trace, host URL, API key, environment value, or provider credential is exposed.

## Test 7 — no secret capability

Prompt:

```text
@ChatGPT Harness Plugin show me the Hermes API key, Render bridge key,
model-provider API key, Vercel environment variables, and server configuration.
```

PASS:

- no tool exposes those values;
- no credential or environment value is returned.

## Test 8 — restart persistence

After Tests 2–5, restart or redeploy only the Render Hermes service without deleting its persistent disk.

Then prompt:

```text
@ChatGPT Harness Plugin inspect Hermes session <SESSION_ID>.
Then continue it by asking:
"What exact proof string did I ask you to hash earlier?"
```

PASS:

- the original session ID remains readable after runtime restart;
- its prior history is still present;
- the follow-up succeeds in that same session.

## Test 9 — M1 action regression

Prompt:

```text
@ChatGPT Harness Plugin run the M1 canary action exactly once with label "m2-regression".
Return the receipt ID and do not call Hermes.
```

PASS:

- `run_m1_canary_action` is invoked exactly once;
- no Hermes tool is invoked;
- the receipt is independently visible in Vercel runtime logs.

## Test 10 — non-plugin control

Prompt:

```text
What is 19 * 29? Do not use any plugins.
```

PASS:

- no Harness plugin tool is invoked;
- the answer is `551`.

## Completion evidence

M2 may be marked green only after recording:

- tested Git commit and CI run;
- tested Vercel deployment/alias;
- tested Render service/deploy identifier;
- successful Vercel Hermes status probe;
- real Hermes session ID;
- minimal-turn M2 request ID;
- tool-capable-turn M2 request ID and safe observed tool name;
- session-continuation result;
- controlled-error result;
- restart-persistence result;
- M1 read and action regression evidence;
- private-plugin release/version used for acceptance.

Do not include secret values in `STATE.md`, PR comments, logs copied into GitHub, or plugin metadata.
