#!/bin/sh
set -eu

PROVIDER="${HERMES_M2_PROVIDER:-openai-api}"
MODEL="${HERMES_M2_MODEL:-gpt-5.4-mini}"

if [ -z "${API_SERVER_KEY:-}" ]; then
  echo "[m2-runtime] API_SERVER_KEY is required." >&2
  exit 64
fi

if [ -z "${HERMES_BRIDGE_KEY:-}" ]; then
  echo "[m2-runtime] HERMES_BRIDGE_KEY is required." >&2
  exit 64
fi

if [ "$PROVIDER" = "openai-api" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "[m2-runtime] OPENAI_API_KEY is required for the configured M2 provider." >&2
  exit 64
fi

export API_SERVER_ENABLED=true
export API_SERVER_HOST=127.0.0.1
export API_SERVER_PORT="${API_SERVER_PORT:-8642}"
export HERMES_DASHBOARD=0

/opt/hermes/.venv/bin/python - "$PROVIDER" "$MODEL" <<'PY'
import os
import sys
from pathlib import Path

import yaml

provider, model_name = sys.argv[1], sys.argv[2]
config_path = Path("/opt/data/config.yaml")
config_path.parent.mkdir(parents=True, exist_ok=True)

if config_path.exists():
    raw = config_path.read_text(encoding="utf-8")
    data = yaml.safe_load(raw) if raw.strip() else {}
else:
    data = {}

if data is None:
    data = {}
if not isinstance(data, dict):
    raise SystemExit("[m2-runtime] Existing Hermes config.yaml is not a mapping.")

model = data.get("model")
initialize = model in (None, "")
if isinstance(model, dict):
    current_provider = str(model.get("provider") or "").strip()
    current_model = str(model.get("default") or "").strip()
    initialize = not current_model and current_provider in ("", "auto")

if initialize:
    data["model"] = {
        "provider": provider,
        "default": model_name,
        "base_url": "",
        "api_mode": "",
    }
    temporary = config_path.with_suffix(".yaml.tmp")
    temporary.write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    os.replace(temporary, config_path)
    print(f"[m2-runtime] Initialized Hermes model config for provider={provider}.")
else:
    print("[m2-runtime] Preserving existing Hermes model configuration.")
PY

hermes gateway run &
gateway_pid=$!
bridge_pid=""

cleanup() {
  if [ -n "$bridge_pid" ]; then
    kill "$bridge_pid" 2>/dev/null || true
    wait "$bridge_pid" 2>/dev/null || true
  fi
  kill "$gateway_pid" 2>/dev/null || true
  wait "$gateway_pid" 2>/dev/null || true
}

trap 'cleanup; exit 143' TERM INT HUP
trap 'cleanup' EXIT

/opt/hermes/.venv/bin/python /opt/m2/bridge.py &
bridge_pid=$!

set +e
wait "$bridge_pid"
status=$?
set -e

trap - EXIT
cleanup
exit "$status"
