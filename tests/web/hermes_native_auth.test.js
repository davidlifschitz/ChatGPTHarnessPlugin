'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  getAccessCredential,
  normalizeBearerPayload,
  normalizeCredentialPayload,
  persistCredentials,
  readCredentialRecord,
  redactCredentialText,
} = require('../../lib/hermes-cloud-auth');
const { MemoryStateStore, getStateStore, setStateStoreForTests } = require('../../lib/state-store');
const { listenForLoopbackCode, runAuthorization } = require('../../tools/m2-native-authorize');

const oldOrigin = process.env.HERMES_CLOUD_ORIGIN;

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': data.length });
  res.end(data);
}

async function readJson(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : {};
}

async function withRefreshServer(handler, fn, options = {}) {
  const previousOrigin = process.env.HERMES_CLOUD_ORIGIN;
  const previousRequestTimeout = process.env.HERMES_REQUEST_TIMEOUT_MS;
  const store = new MemoryStateStore();
  setStateStoreForTests(store);
  if (options.requestTimeoutMs) process.env.HERMES_REQUEST_TIMEOUT_MS = String(options.requestTimeoutMs);
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.HERMES_CLOUD_ORIGIN = origin;
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 1;
  await persistCredentials({
    cloud_origin: origin,
    access_token: 'old-access-secret-sentinel',
    refresh_token: 'old-refresh-secret-sentinel',
    token_type: 'Bearer',
    expires_at: expiresAt,
    provider: 'provider-a',
    user_id: 'user-a',
  });
  try {
    await fn({ origin, store, server });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
    setStateStoreForTests(null);
    if (previousOrigin === undefined) delete process.env.HERMES_CLOUD_ORIGIN; else process.env.HERMES_CLOUD_ORIGIN = previousOrigin;
    if (previousRequestTimeout === undefined) delete process.env.HERMES_REQUEST_TIMEOUT_MS;
    else process.env.HERMES_REQUEST_TIMEOUT_MS = previousRequestTimeout;
  }
}

function tokenPayload(origin, overrides = {}) {
  return {
    cloud_origin: origin,
    access_token: 'new-access-secret-sentinel',
    refresh_token: 'new-refresh-secret-sentinel',
    token_type: 'Bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    provider: 'provider-a',
    user_id: 'user-a',
    ...overrides,
  };
}

test('native bearer payload requires canonical Bearer type, Unix-second expiry, and stable identity', () => {
  const payload = {
    access_token: 'access-secret-sentinel', refresh_token: 'refresh-secret-sentinel',
    token_type: 'Bearer', expires_at: 1900000000, provider: 'provider-a', user_id: 'user-a',
  };
  assert.equal(normalizeBearerPayload(payload).expires_at, 1900000000);
  assert.throws(() => normalizeBearerPayload({ ...payload, expires_at: '1900000000' }), { code: 'hermes_auth_response_invalid' });
  assert.throws(() => normalizeBearerPayload({ ...payload, token_type: 'bearer' }), { code: 'hermes_auth_response_invalid' });
  assert.throws(() => normalizeBearerPayload({ ...payload, user_id: 'user-b' }, { provider: 'provider-a', user_id: 'user-a' }), { code: 'hermes_reauth_required' });
});

test('credential persistence rejects a different issuer and an account identity change', async () => {
  await withRefreshServer((_req, res) => json(res, 404, {}), async ({ origin }) => {
    assert.throws(() => normalizeCredentialPayload(tokenPayload('https://other.example'), origin), { code: 'hermes_credentials_invalid' });
    await assert.rejects(() => persistCredentials(tokenPayload(origin, { provider: 'provider-b' })), { code: 'hermes_account_identity_changed' });
    const current = await readCredentialRecord();
    assert.equal(current.value.provider, 'provider-a');
    assert.equal(current.value.user_id, 'user-a');
  });
});

test('concurrent callers rotate once and both use the durably persisted winner', async () => {
  let refreshCount = 0;
  let observedRefresh = null;
  await withRefreshServer(async (req, res) => {
    if (req.url !== '/auth/native/refresh') return json(res, 404, {});
    refreshCount += 1;
    observedRefresh = await readJson(req);
    await new Promise((resolve) => setTimeout(resolve, 180));
    json(res, 200, {
      access_token: 'rotated-access-secret-sentinel',
      refresh_token: 'rotated-refresh-secret-sentinel',
      token_type: 'Bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      provider: 'provider-a',
      user_id: 'user-a',
    });
  }, async ({ origin }) => {
    const [a, b] = await Promise.all([
      getAccessCredential({ waitMs: 3000 }),
      getAccessCredential({ waitMs: 3000 }),
    ]);
    assert.equal(refreshCount, 1);
    assert.deepEqual(observedRefresh, { refresh_token: 'old-refresh-secret-sentinel', provider: 'provider-a' });
    assert.equal(a.accessToken, 'rotated-access-secret-sentinel');
    assert.equal(b.accessToken, 'rotated-access-secret-sentinel');
    const stored = await readCredentialRecord();
    assert.equal(stored.value.issuer, origin);
    assert.equal(stored.value.generation, 2);
    assert.equal(stored.value.refresh_token, 'rotated-refresh-secret-sentinel');
    assert.equal(stored.value.last_refresh_from_generation, 1);
    assert.equal(stored.value.refresh_state, null);
  });
});

test('server-only forced refresh rotates a still-fresh credential and persists the new refresh token', async () => {
  let refreshCount = 0;
  await withRefreshServer(async (req, res) => {
    if (req.url !== '/auth/native/refresh') return json(res, 404, {});
    refreshCount += 1;
    const body = await readJson(req);
    assert.equal(body.refresh_token, 'old-refresh-secret-sentinel');
    json(res, 200, tokenPayload(process.env.HERMES_CLOUD_ORIGIN, {
      access_token: 'forced-access-secret-sentinel',
      refresh_token: 'forced-refresh-secret-sentinel',
    }));
  }, async ({ origin }) => {
    const before = await readCredentialRecord();
    assert.equal(before.value.expires_at > Math.floor(Date.now() / 1000) + 1800, true);
    const credential = await getAccessCredential({ forceRefresh: true });
    const stored = await readCredentialRecord();
    assert.equal(refreshCount, 1);
    assert.equal(credential.accessToken, 'forced-access-secret-sentinel');
    assert.equal(stored.value.access_token, 'forced-access-secret-sentinel');
    assert.equal(stored.value.refresh_token, 'forced-refresh-secret-sentinel');
    assert.equal(stored.value.provider, 'provider-a');
    assert.equal(stored.value.user_id, 'user-a');
    assert.equal(stored.value.issuer, origin);
    assert.equal(stored.value.generation, 2);
    assert.equal(stored.value.last_refresh_from_generation, 1);
  }, { expiresAt: Math.floor(Date.now() / 1000) + 3600 });
});

test('concurrent forced refresh callers that observed one generation coalesce on its persisted winner', async () => {
  let refreshCount = 0;
  await withRefreshServer(async (req, res) => {
    if (req.url !== '/auth/native/refresh') return json(res, 404, {});
    refreshCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    json(res, 200, tokenPayload(process.env.HERMES_CLOUD_ORIGIN, {
      access_token: 'forced-shared-access-sentinel',
      refresh_token: 'forced-shared-refresh-sentinel',
    }));
  }, async () => {
    const [first, second] = await Promise.all([
      getAccessCredential({ forceRefresh: true, waitMs: 3000 }),
      getAccessCredential({ forceRefresh: true, waitMs: 3000 }),
    ]);
    const stored = await readCredentialRecord();
    assert.equal(refreshCount, 1);
    assert.equal(first.accessToken, 'forced-shared-access-sentinel');
    assert.equal(second.accessToken, 'forced-shared-access-sentinel');
    assert.equal(stored.value.generation, 2);
    assert.equal(stored.value.refresh_token, 'forced-shared-refresh-sentinel');
    assert.equal(stored.value.last_refresh_from_generation, 1);
    assert.equal(stored.value.refresh_state, null);
  }, { expiresAt: Math.floor(Date.now() / 1000) + 3600 });
});

test('ambiguous refresh timeout is fail-closed and never replays the old refresh token', async () => {
  let refreshCount = 0;
  await withRefreshServer((req, res) => {
    if (req.url === '/auth/native/refresh') { refreshCount += 1; return; }
    json(res, 404, {});
  }, async () => {
    await assert.rejects(() => getAccessCredential(), (error) => {
      assert.equal(error.code, 'hermes_reauth_required');
      assert.equal(error.message.includes('uncommitted-access-secret-sentinel'), false);
      assert.equal(error.message.includes('uncommitted-refresh-secret-sentinel'), false);
      return true;
    });
    await assert.rejects(() => getAccessCredential(), { code: 'hermes_reauth_required' });
    assert.equal(refreshCount, 1);
    const stored = await readCredentialRecord();
    assert.equal(stored.value.refresh_state.status, 'uncertain');
    const message = await redactCredentialText('Bearer old-access-secret-sentinel old-refresh-secret-sentinel');
    assert.equal(message.includes('old-access-secret-sentinel'), false);
    assert.equal(message.includes('old-refresh-secret-sentinel'), false);
  }, { requestTimeoutMs: 150 });
});

test('HTTP 503 after refresh is not treated as a safe rotation retry', async () => {
  let refreshCount = 0;
  await withRefreshServer((req, res) => {
    if (req.url === '/auth/native/refresh') {
      refreshCount += 1;
      return json(res, 503, { error: 'provider_unavailable', detail: 'old-refresh-secret-sentinel' });
    }
    json(res, 404, {});
  }, async () => {
    await assert.rejects(() => getAccessCredential(), { code: 'hermes_reauth_required' });
    await assert.rejects(() => getAccessCredential(), { code: 'hermes_reauth_required' });
    assert.equal(refreshCount, 1);
    assert.equal((await readCredentialRecord()).value.refresh_state.status, 'uncertain');
  });
});

test('failed persistence of rotated credentials does not return the uncommitted access token', async () => {
  await withRefreshServer((req, res) => {
    if (req.url === '/auth/native/refresh') {
      return json(res, 200, {
        access_token: 'uncommitted-access-secret-sentinel',
        refresh_token: 'uncommitted-refresh-secret-sentinel',
        token_type: 'Bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
        provider: 'provider-a', user_id: 'user-a',
      });
    }
    json(res, 404, {});
  }, async ({ store }) => {
    const originalCas = store.compareAndSwapJson.bind(store);
    let failRotatedCommit = true;
    store.compareAndSwapJson = async (path, version, value) => {
      if (path === 'm2/hermes/credentials' && value?.generation === 2 && value?.refresh_state === null && failRotatedCommit) {
        failRotatedCommit = false;
        return false;
      }
      return originalCas(path, version, value);
    };
    await assert.rejects(() => getAccessCredential(), { code: 'hermes_reauth_required' });
    const stored = await readCredentialRecord();
    assert.equal(stored.value.access_token, 'old-access-secret-sentinel');
    assert.equal(stored.value.refresh_state.status, 'uncertain');
  });
});

test('expired refresh lease is treated as uncertain instead of starting a second rotation', async () => {
  let refreshCount = 0;
  await withRefreshServer((req, res) => {
    if (req.url === '/auth/native/refresh') { refreshCount += 1; return json(res, 200, {}); }
    json(res, 404, {});
  }, async ({ store }) => {
    const current = await store.readVersionedJson('m2/hermes/credentials');
    await store.compareAndSwapJson('m2/hermes/credentials', current.version, {
      ...current.value,
      refresh_state: { status: 'refreshing', lease_id: 'expired-lease', started_at: 1, lease_until: Date.now() - 1 },
    });
    await assert.rejects(() => getAccessCredential(), { code: 'hermes_reauth_required' });
    assert.equal(refreshCount, 0);
    assert.equal((await readCredentialRecord()).value.refresh_state.status, 'uncertain');
  });
});

test('module test store can be reset without retaining credential data', () => {
  const store = new MemoryStateStore();
  setStateStoreForTests(store);
  assert.equal(getStateStore(), store);
  setStateStoreForTests(null);
  assert.notEqual(getStateStore(), store);
});

test('native authorization exchanges one PKCE code and transfers tokens directly to the operator API', async () => {
  let tokenExchanges = 0;
  let operatorBody = null;
  let printed = '';
  const cloud = http.createServer(async (req, res) => {
    if (req.url !== '/auth/native/token' || req.method !== 'POST') return json(res, 404, {});
    tokenExchanges += 1;
    const body = await readJson(req);
    assert.equal(body.code, 'one-time-code-sentinel');
    assert.equal(typeof body.code_verifier, 'string');
    assert.equal(body.code_verifier.length >= 40, true);
    json(res, 200, {
      access_token: 'cli-access-secret-sentinel',
      refresh_token: 'cli-refresh-secret-sentinel',
      token_type: 'Bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      provider: 'provider-cli', user_id: 'user-cli',
    });
  });
  const product = http.createServer(async (req, res) => {
    if (req.url !== '/api/native-bootstrap' || req.method !== 'POST') return json(res, 404, {});
    assert.equal(req.headers.authorization, 'Bearer operator-secret-sentinel-token-1234567890');
    operatorBody = await readJson(req);
    json(res, 200, { stored: true });
  });
  await new Promise((resolve) => cloud.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => product.listen(0, '127.0.0.1', resolve));
  const cloudOrigin = `http://127.0.0.1:${cloud.address().port}`;
  const publicOrigin = `http://127.0.0.1:${product.address().port}`;
  try {
    const result = await runAuthorization({
      cloudOrigin,
      publicOrigin,
      operatorToken: 'operator-secret-sentinel-token-1234567890',
      timeoutMs: 5000,
      requestTimeoutMs: 2000,
      write(value) {
        printed += `${value}\n`;
        if (!value.includes('/auth/native/authorize')) return;
        const match = value.match(/https?:\/\/[^\s]+/);
        assert.ok(match);
        const authorization = new URL(match[0]);
        assert.equal(authorization.pathname, '/auth/native/authorize');
        assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
        assert.ok(authorization.searchParams.get('code_challenge'));
        assert.ok(authorization.searchParams.get('state'));
        assert.equal(authorization.search.includes('code_verifier'), false);
        const callback = new URL(authorization.searchParams.get('redirect_uri'));
        callback.searchParams.set('state', authorization.searchParams.get('state'));
        callback.searchParams.set('code', 'one-time-code-sentinel');
        void http.get(callback, (response) => {
          const location = response.headers.location;
          response.resume();
          if (response.statusCode === 302 && location === '/done') {
            void http.get(new URL(location, callback.origin), (done) => done.resume());
          }
        });
      },
    });
    assert.deepEqual(result, { stored: true, provider: 'provider-cli' });
    assert.equal(tokenExchanges, 1);
    assert.equal(operatorBody.action, 'store_hermes_credentials');
    assert.equal(operatorBody.credentials.cloud_origin, cloudOrigin);
    assert.equal(operatorBody.credentials.access_token, 'cli-access-secret-sentinel');
    assert.equal(operatorBody.credentials.refresh_token, 'cli-refresh-secret-sentinel');
    for (const secret of ['cli-access-secret-sentinel', 'cli-refresh-secret-sentinel', 'operator-secret-sentinel-token-1234567890', 'one-time-code-sentinel']) {
      assert.equal(printed.includes(secret), false);
    }
  } finally {
    cloud.closeAllConnections?.();
    product.closeAllConnections?.();
    await new Promise((resolve) => cloud.close(resolve));
    await new Promise((resolve) => product.close(resolve));
  }
});

test('native loopback callback requires the exact path and state before returning an auth code', async () => {
  const server = http.createServer();
  const expectedState = 'native-state-sentinel';
  const callback = await listenForLoopbackCode(server, expectedState, 3000);
  const requestInfo = (url) => new Promise((resolve, reject) => {
    http.get(url, (response) => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location }));
    }).on('error', reject);
  });
  try {
    const wrongPath = new URL('/other?state=native-state-sentinel&code=must-not-be-accepted', callback.redirectUri);
    assert.equal((await requestInfo(wrongPath)).status, 404);
    const wrongState = new URL('/cb?state=wrong-state&code=must-not-be-accepted', callback.redirectUri);
    assert.equal((await requestInfo(wrongState)).status, 400);
    const accepted = new URL('/cb?state=native-state-sentinel&code=single-use-code', callback.redirectUri);
    const redirect = await requestInfo(accepted);
    assert.equal(redirect.status, 302);
    assert.equal(redirect.location, '/done');
    assert.equal(redirect.location.includes('code'), false);
    assert.equal(redirect.location.includes('state'), false);
    assert.equal(await callback.codePromise, 'single-use-code');
    const doneUrl = new URL(redirect.location, callback.redirectUri);
    assert.equal(doneUrl.pathname, '/done');
    assert.equal(doneUrl.search, '');
    assert.equal((await requestInfo(doneUrl)).status, 200);
    assert.equal(await callback.donePromise, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('credential redaction protects labelled secrets before output truncation', async () => {
  await withRefreshServer((_req, res) => json(res, 404, {}), async () => {
    const labelled = await redactCredentialText(
      `prefix ${'p'.repeat(100)} API_SERVER_KEY=${'api-server-secret-sentinel'.repeat(20)} MCP_REFRESH_TOKEN=${'mcp-refresh-secret-sentinel'.repeat(4)} BLOB_READ_WRITE_TOKEN=${'blob-token-secret-sentinel'.repeat(4)}`,
      140,
    );
    for (const secret of ['api-server-secret-sentinel', 'mcp-refresh-secret-sentinel', 'blob-token-secret-sentinel']) {
      assert.equal(labelled.includes(secret), false);
    }
    const knownTokenAtBoundary = await redactCredentialText(
      `${'x'.repeat(11990)}old-access-secret-sentinel`,
      12000,
    );
    assert.equal(knownTokenAtBoundary.includes('old-access-secret-sentinel'), false);
    assert.equal(knownTokenAtBoundary.includes('old-access-secret'), false);
  });
});

test('native authorization rejects an undersized operator key before printing a consent URL', async () => {
  let output = '';
  await assert.rejects(() => runAuthorization({
    cloudOrigin: 'http://127.0.0.1:1',
    publicOrigin: 'http://127.0.0.1:2',
    operatorToken: 'x'.repeat(31),
    write: (value) => { output += value; },
  }), /M2_OPERATOR_TOKEN is missing or invalid/);
  assert.equal(output, '');
});

test('refresh claim contention stops at the caller deadline without upstream use', async () => {
  let requests = 0;
  await withRefreshServer((_req, res) => { requests += 1; json(res, 500, {}); }, async ({ store }) => {
    let claims = 0;
    store.compareAndSwapJson = async () => {
      claims += 1;
      if (claims > 3) throw new Error('Unbounded refresh claim retries.');
      await new Promise(resolve => setTimeout(resolve, 15));
      return false;
    };
    await assert.rejects(() => getAccessCredential({ waitMs: 5 }), { code: 'hermes_refresh_in_progress' });
    assert.equal(claims, 1);
    assert.equal(requests, 0);
  });
});

test('output redaction fails closed when private credentials cannot be read', async () => {
  await withRefreshServer((_req, res) => json(res, 404, {}), async ({ store }) => {
    store.readVersionedJson = async () => { throw new Error('Private store unavailable.'); };
    await assert.rejects(() => redactCredentialText('old-access-secret-sentinel'), { code: 'hermes_output_unavailable' });
  });
});

test('output redaction removes unlabelled operator and private Blob credentials', async () => {
  const beforeOperator = process.env.M2_OPERATOR_TOKEN;
  const beforeBlob = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    process.env.M2_OPERATOR_TOKEN = 'operator-secret-sentinel-unlabelled';
    process.env.BLOB_READ_WRITE_TOKEN = 'blob-secret-sentinel-unlabelled';
    await withRefreshServer((_req, res) => json(res, 404, {}), async () => {
      const output = await redactCredentialText(`${process.env.M2_OPERATOR_TOKEN} ${process.env.BLOB_READ_WRITE_TOKEN}`);
      assert.equal(output.includes(process.env.M2_OPERATOR_TOKEN), false);
      assert.equal(output.includes(process.env.BLOB_READ_WRITE_TOKEN), false);
    });
  } finally {
    if (beforeOperator === undefined) delete process.env.M2_OPERATOR_TOKEN; else process.env.M2_OPERATOR_TOKEN = beforeOperator;
    if (beforeBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = beforeBlob;
  }
});

test.after(() => {
  if (oldOrigin === undefined) delete process.env.HERMES_CLOUD_ORIGIN; else process.env.HERMES_CLOUD_ORIGIN = oldOrigin;
});
