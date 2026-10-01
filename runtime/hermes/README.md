# M2 Hermes runtime on Render

This directory defines the narrow operator-controlled Hermes runtime allowed by ADR 0005 for M2.

## Boundary

The official `nousresearch/hermes-agent:latest` image remains the harness. Hermes owns sessions, tool execution, memory, skills, and model runtime behavior.

The public Render port is **not** the raw Hermes API server. `bridge.py` listens on Render's public `PORT`, requires `HERMES_BRIDGE_KEY`, and forwards accepted requests to Hermes on container loopback using a separate `API_SERVER_KEY`. The raw Hermes API stays bound to `127.0.0.1:8642`.

`/health` is the only unauthenticated bridge route. It returns only `{"status":"ok"}` after the loopback Hermes health check succeeds.

## Persistence

Render mounts a single 2 GB persistent disk at `/opt/data`, which is Hermes' documented state root. Sessions and other Hermes-native state therefore remain on the harness volume rather than being mirrored in this repository or Vercel.

## Model configuration

The M2 runtime defaults to the direct OpenAI API provider and `gpt-5.4`. `OPENAI_API_KEY` and `HERMES_BRIDGE_KEY` are declared with `sync: false`; their values must be supplied directly to Render and must never be committed, pasted into prompts, or copied into plugin files.

On first boot only, `start-hermes.sh` initializes the persisted Hermes `model` block when it is genuinely unconfigured. An existing configured model is preserved.

## Provisioning gate

Creating the Blueprint provisions a paid `1c-2g` web service plus a persistent disk. Do not create it until the user approves the paid infrastructure action.

Use `runtime/hermes/render.yaml` as the Blueprint path. After provisioning:

1. verify Render `/health` is healthy;
2. obtain the public service origin without exposing either secret;
3. configure the Vercel M2 Preview with:
   - `HERMES_BASE_URL=<Render service origin>`
   - `HERMES_API_KEY=<the same HERMES_BRIDGE_KEY entered directly in Render>`
4. enter the bridge secret directly in each provider UI/tool flow; never paste it into chat, source control, logs, or PR text;
5. never copy Render's internal `API_SERVER_KEY` to Vercel;
6. run the M2 live acceptance suite;
7. restart/redeploy the Hermes service and confirm the same session remains readable before M2 can be marked green.

The Render service is an M2 proof runtime, not the M3 multi-user architecture.
