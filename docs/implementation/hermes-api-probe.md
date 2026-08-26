# Hermes API Probe

This probe verifies the supported Hermes HTTP surface on a real deployment before this project adds custom infrastructure.

## Requirements

- Python 3.11+
- a reachable Hermes API server
- the server's `API_SERVER_KEY`

Do not commit the API key or paste it into issues, PRs, logs, or chat.

## Read-only check

```bash
export HERMES_BASE_URL='https://your-hermes-host.example'
export HERMES_API_KEY='set-locally-never-commit'
python tools/hermes_probe.py --base-url "$HERMES_BASE_URL"
```

The default command calls:

- `GET /v1/capabilities`
- `GET /v1/models`
- `GET /api/sessions`

`/v1/models` is the supported OpenAI-compatible model-discovery surface. The advertised model ID can be the active profile name; `hermes-agent` is only the default profile's default model name.

If the session API returns `404`, the report marks it unsupported rather than inventing support. Authentication, network, model-discovery, and other HTTP failures still fail the probe.

## Explicit real agent turn

A model turn is never run by default. To deliberately exercise the real agent:

```bash
python tools/hermes_probe.py \
  --base-url "$HERMES_BASE_URL" \
  --chat 'Reply with exactly: probe-ok'
```

This can incur inference/tool usage. The probe discovers the model ID from `/v1/models` and sends that advertised ID back to `/v1/chat/completions`.

## Deployment note

Official Hermes documentation currently lists these API-server defaults:

- `API_SERVER_ENABLED=false`
- `API_SERVER_HOST=127.0.0.1`
- `API_SERVER_PORT=8642`
- `API_SERVER_KEY` required whenever enabled

So a fresh Hermes installation is not automatically an externally reachable API backend. A networked deployment must explicitly enable the server and provide a secured ingress/bind path. Most documented web frontends can connect server-to-server, which is preferable to shipping the Hermes bearer key to browser JavaScript.

The current Hermes Cloud product's exact API-server ingress remains a live M1 verification item; these local/self-hosted configuration docs do not prove that Hermes Cloud publishes port 8642 or an equivalent public URL automatically.

## Local validation

```bash
python -m unittest -v tests.test_hermes_probe
python tools/hermes_probe.py --help
python -m py_compile tools/hermes_probe.py tests/test_hermes_probe.py
```

The unit tests use a local HTTP server and do not contact Nous/Hermes or consume model usage.

## What this does not prove

Passing local tests proves the probe's behavior, not that the user's current Hermes Cloud instance exposes a publicly reachable API server. M1 is not complete until the command succeeds against that real deployment.

## Authoritative upstream references

- https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server
- https://hermes-agent.nousresearch.com/docs/reference/environment-variables
- https://hermes-agent.nousresearch.com/docs/user-guide/docker
