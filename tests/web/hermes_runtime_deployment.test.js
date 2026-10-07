'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');

test('operator runtime uses the official Hermes image without copying product files', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'ops/hermes-runtime/Dockerfile'), 'utf8');
  assert.match(dockerfile, /FROM nousresearch\/hermes-agent:latest/);
  assert.match(dockerfile, /CMD \["gateway", "run"\]/);
  assert.doesNotMatch(dockerfile, /\b(COPY|ADD)\b/);
  assert.doesNotMatch(dockerfile, /API_SERVER_KEY\s*=/);
});

test('Railway runtime configuration keeps one persistent service shape', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'railway.json'), 'utf8'));
  assert.equal(config.build.builder, 'DOCKERFILE');
  assert.equal(config.build.dockerfilePath, 'ops/hermes-runtime/Dockerfile');
  assert.deepEqual(config.deploy, {
    healthcheckPath: '/health',
    healthcheckTimeout: 300,
    restartPolicyType: 'ON_FAILURE',
  });
  assert.equal(config.build.watchPatterns.includes('/ops/hermes-runtime/**'), true);
});

test('runtime environment example has no credential value', () => {
  const envExample = fs.readFileSync(path.join(root, 'ops/hermes-runtime/runtime.env.example'), 'utf8');
  assert.match(envExample, /API_SERVER_ENABLED=true/);
  assert.match(envExample, /API_SERVER_HOST=0\.0\.0\.0/);
  assert.match(envExample, /API_SERVER_PORT=8642/);
  assert.match(envExample, /# API_SERVER_KEY=\s*$/m);
  assert.doesNotMatch(envExample, /API_SERVER_KEY=(?!\s*$)/);
});
