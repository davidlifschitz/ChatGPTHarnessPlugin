const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Render Hermes runtime keeps raw API on loopback behind a separate bridge credential', () => {
  const dockerfile = read('runtime/hermes/Dockerfile');
  const start = read('runtime/hermes/start-hermes.sh');
  const bridge = read('runtime/hermes/bridge.py');
  const blueprint = read('runtime/hermes/render.yaml');

  assert.match(dockerfile, /FROM docker\.io\/nousresearch\/hermes-agent:latest/);
  assert.match(dockerfile, /CMD \["\/opt\/m2\/start-hermes\.sh"\]/);

  assert.match(start, /API_SERVER_HOST=127\.0\.0\.1/);
  assert.match(start, /API_SERVER_KEY is required/);
  assert.match(start, /HERMES_BRIDGE_KEY is required/);
  assert.match(start, /OPENAI_API_KEY is required/);
  assert.match(start, /\/opt\/hermes\/\.venv\/bin\/python \/opt\/m2\/bridge\.py &/);
  assert.match(start, /wait "\$bridge_pid"/);

  assert.match(bridge, /UPSTREAM_HOST = "127\.0\.0\.1"/);
  assert.match(bridge, /HERMES_BRIDGE_KEY/);
  assert.match(bridge, /hmac\.compare_digest\(supplied, expected\)/);
  assert.match(bridge, /unsupported_route/);
  assert.match(bridge, /method_not_allowed/);
  assert.match(bridge, /"Authorization": f"Bearer \{UPSTREAM_KEY\}"/);
  assert.match(bridge, /self\.path in \("\/health", "\/health\/"\)/);

  assert.match(blueprint, /healthCheckPath: \/health/);
  assert.match(blueprint, /mountPath: \/opt\/data/);
  assert.match(blueprint, /sizeGB: 2/);
  assert.match(blueprint, /plan: 1c-2g/);
  assert.match(blueprint, /key: API_SERVER_KEY\s+generateValue: true/);
  assert.match(blueprint, /key: HERMES_BRIDGE_KEY\s+generateValue: true/);
  assert.match(blueprint, /key: OPENAI_API_KEY\s+sync: false/);
  assert.match(blueprint, /key: HERMES_DASHBOARD\s+value: "0"/);
  assert.doesNotMatch(blueprint, /API_SERVER_CORS_ORIGINS/);
});

test('runtime configuration contains no committed credential values', () => {
  const combined = [
    read('runtime/hermes/Dockerfile'),
    read('runtime/hermes/start-hermes.sh'),
    read('runtime/hermes/bridge.py'),
    read('runtime/hermes/render.yaml'),
  ].join('\n');

  assert.doesNotMatch(combined, /sk-[A-Za-z0-9_-]{12,}/);
  assert.doesNotMatch(combined, /rnd_[A-Za-z0-9_-]{12,}/);
  assert.doesNotMatch(combined, /API_SERVER_KEY\s*=\s*["'][^"$]/);
  assert.doesNotMatch(combined, /HERMES_BRIDGE_KEY\s*=\s*["'][^"$]/);
});
