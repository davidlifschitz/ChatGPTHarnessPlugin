# Operator-controlled Hermes runtime on Railway

This is the M1 deployment recipe for one persistent Hermes runtime. Railway is
only the host and HTTPS transport; Hermes remains authoritative for execution,
sessions, memory, tools, skills, model routing, and runtime state.

## Why this host

The current local environment has an authenticated Railway account and Docker.
Railway provides a long-running service primitive, Docker image deployment,
service variables, persistent volumes, generated HTTPS domains, and deploy-time
health checks. The existing `ml-job-swarm` project is unrelated and must not be
reused for this runtime.

This choice is intentionally replaceable. Cloudflare may be placed in front of
the service later for an additional Access service-token layer, but it is not a
runtime, state store, or scheduler. The first safe path uses Railway HTTPS plus
Hermes bearer authentication so no dashboard OAuth layer sits in front of the
API server.

## Runtime contract

The service runs the official `nousresearch/hermes-agent` image with
`gateway run`. The image is stateless; the single Railway volume must be mounted
at `/opt/data`, which is Hermes' native persistent data directory. Never run a
second gateway against the same volume.

Required Railway service variables:

```text
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
PORT=8642
API_SERVER_KEY=<generated in the Railway secret UI; never paste into chat>
```

Do not set `HERMES_DASHBOARD`, `API_SERVER_CORS_ORIGINS`, or any
`NEXT_PUBLIC_*` variable for this path. The public dashboard is not needed and
browser callers go through Vercel.

Railway service settings:

- one replica only;
- one volume mounted at `/opt/data`;
- healthcheck path `/health`;
- restart policy `ON_FAILURE` (the checked-in configuration is compatible with
  free/trial plan limits);
- no public port other than the Railway HTTPS service domain;
- no preview/production distinction inside the Hermes runtime service.

The generated Railway HTTPS domain is the candidate value for Vercel's
Preview-only `HERMES_BASE_URL`. The Vercel connector continues to send
`Authorization: Bearer <HERMES_API_KEY>`, where the value is the same secret as
Hermes' `API_SERVER_KEY`. The key must remain server-only in both systems.

## Deployment sequence

These commands are deliberately not run against the unrelated existing Railway
project. The operator must create or select a dedicated project named for this
runtime before running them:

```bash
railway init
railway link
railway up
```

After the service exists, add a single volume mounted at `/opt/data` and set
the variables above through Railway's Variables UI or the Railway CLI. Do not
put `API_SERVER_KEY` or the Portal refresh token in Git, shell history, logs, or
chat. The service should not be considered live until its healthcheck is green.

The official Hermes Docker setup must then be completed inside the deployed
container:

```bash
hermes setup --portal
```

Complete the Nous Portal browser/OAuth step personally when prompted. The
resulting Portal refresh credential belongs in Hermes' mounted `/opt/data`
state, not in Vercel and not in the repository. Re-verify `hermes portal info`
without printing credentials.

## Read-only gate before Vercel

Set `HERMES_BASE_URL` to the generated Railway HTTPS origin only after the
following server-side requests succeed against the Railway service, with the
Hermes API key supplied from a secure environment variable:

```text
GET /health
GET /v1/capabilities
GET /v1/models
GET /api/sessions
```

Run `tools/hermes_probe.py` against the same origin. Do not send a model request
until every read-only check has passed. The first real check is exactly one
request whose content is `Reply with exactly: probe-ok`; the expected assistant
content is exactly `probe-ok`.

## Vercel Preview wiring

Update only the Preview environment of `hermes-consumer-layer-m1`:

- `HERMES_BASE_URL`: the Railway HTTPS origin, without a trailing slash;
- `HERMES_API_KEY`: the same secret as `API_SERVER_KEY`;
- no `NEXT_PUBLIC_` variables;
- no Production variables.

Verify `/api/status`, then make exactly one `/api/chat` request with
`Reply with exactly: probe-ok`. Inspect runtime logs for absence of the
Hermes key, authorization headers, Railway/Portal credentials, and secret-
bearing URLs.

## Restart/persistence gate

Before claiming M1 completion:

1. create or observe one harmless Hermes-native session/state record;
2. restart the Railway service using its supported restart action;
3. wait for `/health` to return 200;
4. verify the expected state/session remains and the API reads still pass;
5. verify Vercel Preview reconnects.

Do not run load tests, create additional Hermes agents, or use the existing
`ml-job-swarm` project as a substitute.

## Cost boundary

Railway's current pricing is a subscription plus actual resource usage. A new
Hobby workspace is listed at $5/month, with compute and volume usage billed by
resource; the current account plan must be confirmed before provisioning.
Creating the dedicated service and volume is therefore an explicit external
resource action. Until it is approved and created, this repository can be
validated locally but cannot honestly claim a live operator-controlled Hermes
runtime or end-to-end Vercel result.
