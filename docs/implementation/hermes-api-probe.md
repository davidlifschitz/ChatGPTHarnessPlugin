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
- `GET /api/sessions`

If the session API returns `404`, the report marks it unsupported rather than inventing support. Authentication, network, and other HTTP failures still fail the probe.

## Explicit real agent turn

A model turn is never run by default. To deliberately exercise the real agent:

```bash
python tools/hermes_probe.py \
  --base-url "$HERMES_BASE_URL" \
  --chat 'Reply with exactly: probe-ok'
```

This can incur inference/tool usage. The probe uses the documented default API-server model ID `hermes-agent`.

## Local validation

```bash
python -m unittest -v tests.test_hermes_probe
python tools/hermes_probe.py --help
python -m py_compile tools/hermes_probe.py tests/test_hermes_probe.py
```

The unit tests use a local HTTP server and do not contact Nous/Hermes or consume model usage.

## What this does not prove

Passing local tests proves the probe's behavior, not that the user's current Hermes Cloud instance exposes a publicly reachable API server. M1 is not complete until the command succeeds against that real deployment.