const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const {
  persistCredentials,
  readCredentialRecord,
} = require('../../lib/hermes-cloud-auth');
const { MemoryStateStore, setStateStoreForTests } = require('../../lib/state-store');

let stateStore;

function response() {
  return { statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

async function call(body, authorized = true, method = 'POST') {
  let handler;
  try { handler = require('../../api/native-bootstrap'); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    handler = (_req, res) => { res.statusCode = 404; res.end('{"error":"Not found."}'); };
  }
  const res = response();
  await handler({ method, headers: authorized
    ? { authorization: `Bearer ${process.env.M2_OPERATOR_TOKEN}` } : {}, body }, res);
  return res;
}

test.beforeEach(() => {
  process.env.HERMES_CLOUD_ORIGIN = 'https://test-agent.agents.nousresearch.com';
  process.env.M2_PUBLIC_ORIGIN = 'https://m2.example.test';
  process.env.M2_OPERATOR_TOKEN = 'test-only-operator-key-with-over-32-characters';
  stateStore = new MemoryStateStore();
  setStateStoreForTests(stateStore);
});

test.afterEach(() => {
  delete process.env.HERMES_CLOUD_ORIGIN;
  delete process.env.M2_PUBLIC_ORIGIN;
  delete process.env.M2_OPERATOR_TOKEN;
  setStateStoreForTests(null);
});

function credentials() {
  return { cloud_origin: process.env.HERMES_CLOUD_ORIGIN,
    access_token: 'ACCESS_SECRET_SENTINEL', refresh_token: 'REFRESH_SECRET_SENTINEL',
    token_type: 'Bearer', expires_at: Math.floor(Date.now() / 1000) + 600,
    provider: 'nous', user_id: 'test-operator' };
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json', 'content-length': data.length});
  res.end(data);
}

async function readJsonRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function withCloudServer(handler, fn) {
  const previousOrigin = process.env.HERMES_CLOUD_ORIGIN;
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.HERMES_CLOUD_ORIGIN = origin;
  await persistCredentials({
    cloud_origin: origin,
    access_token: 'ACCESS_SECRET_SENTINEL',
    refresh_token: 'REFRESH_SECRET_SENTINEL',
    token_type: 'Bearer',
    expires_at: Math.floor(Date.now() / 1000) + 600,
    provider: 'nous',
    user_id: 'test-operator',
  });
  try {
    await fn({origin, store: stateStore, server});
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
    if (previousOrigin === undefined) delete process.env.HERMES_CLOUD_ORIGIN;
    else process.env.HERMES_CLOUD_ORIGIN = previousOrigin;
  }
}

test('native bootstrap requires operator authorization before reading credential state', async () => {
  const res = await call({ action: 'store_hermes_credentials', credentials: credentials() }, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(JSON.stringify(res.body).includes('SECRET_SENTINEL'), false);
});

test('authorized native bootstrap stores credentials and returns no secret material', async () => {
  const res = await call({ action: 'store_hermes_credentials', credentials: credentials() });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { stored: true });
  assert.equal(JSON.stringify(res).includes('SECRET_SENTINEL'), false);
});

test('bootstrap rejects wrong origins and arbitrary state access with sanitized errors', async () => {
  let res = await call({ action: 'store_hermes_credentials', credentials: {
    ...credentials(), cloud_origin: 'https://attacker.invalid',
  } });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.stringify(res).includes('attacker.invalid'), false);
  res = await call({ action: 'read_private_state', path: 'm2/hermes/credentials' });
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.stringify(res).includes('SECRET_SENTINEL'), false);
});

test('refresh verification rejects unauthenticated operators without calling Hermes', async () => {
  let refreshCalls = 0;
  let ticketCalls = 0;
  await withCloudServer(async (req, res) => {
    if (req.url === '/auth/native/refresh') refreshCalls += 1;
    if (req.url === '/api/auth/ws-ticket') ticketCalls += 1;
    json(res, 404, {error: 'not_found'});
  }, async ({store}) => {
    const before = await readCredentialRecord();
    const res = await call({action: 'verify_hermes_refresh'}, false);
    const invalid = await call({
      action: 'verify_hermes_refresh',
      cloud_origin: 'https://attacker.invalid',
      refresh_token: 'UNTRUSTED_REFRESH_SENTINEL',
    });
    const after = await readCredentialRecord();
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, {error: 'Operator authorization required.'});
    assert.equal(invalid.statusCode, 400);
    assert.equal(JSON.stringify(invalid.body).includes('attacker.invalid'), false);
    assert.equal(JSON.stringify(invalid.body).includes('UNTRUSTED_REFRESH_SENTINEL'), false);
    assert.equal(refreshCalls, 0);
    assert.equal(ticketCalls, 0);
    assert.equal(after.value.generation, before.value.generation);
    assert.equal(after.version, before.version);
    assert.equal(await store.readVersionedJson('m2/hermes/credentials').then(Boolean), true);
  });
});

test('refresh verification confirms rotated credentials and discards the WebSocket ticket', async () => {
  const requests = [];
  await withCloudServer(async (req, res) => {
    requests.push({url: req.url, authorization: req.headers.authorization || ''});
    if (req.url === '/auth/native/refresh') {
      const body = await readJsonRequest(req);
      assert.equal(body.refresh_token, 'REFRESH_SECRET_SENTINEL');
      json(res, 200, {
        access_token: 'ROTATED_ACCESS_SECRET_SENTINEL',
        refresh_token: 'ROTATED_REFRESH_SECRET_SENTINEL',
        token_type: 'Bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        provider: 'nous',
        user_id: 'test-operator',
      });
      return;
    }
    if (req.url === '/api/auth/ws-ticket') {
      assert.equal(req.method, 'POST');
      assert.equal(req.headers.authorization, 'Bearer ROTATED_ACCESS_SECRET_SENTINEL');
      json(res, 200, {ticket: 'DISCARDED_WS_TICKET_SECRET_SENTINEL', ttl_seconds: 30});
      return;
    }
    json(res, 404, {error: 'not_found'});
  }, async ({origin}) => {
    const before = await readCredentialRecord();
    const res = await call({action: 'verify_hermes_refresh'});
    const after = await readCredentialRecord();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {refreshed: true, persisted: true, bearer_verified: true});
    assert.notEqual(after.version, before.version);
    assert.equal(after.value.generation, before.value.generation + 1);
    assert.equal(after.value.last_refresh_from_generation, before.value.generation);
    assert.equal(after.value.access_token, 'ROTATED_ACCESS_SECRET_SENTINEL');
    assert.equal(after.value.refresh_token, 'ROTATED_REFRESH_SECRET_SENTINEL');
    assert.equal(after.value.refresh_state, null);
    assert.deepEqual(requests.map((request) => request.url), [
      '/auth/native/refresh',
      '/api/auth/ws-ticket',
    ]);
    assert.equal(requests[1].authorization, 'Bearer ROTATED_ACCESS_SECRET_SENTINEL');
    const serialized = JSON.stringify(res.body);
    for (const secret of [
      'ACCESS_SECRET_SENTINEL',
      'REFRESH_SECRET_SENTINEL',
      'ROTATED_ACCESS_SECRET_SENTINEL',
      'ROTATED_REFRESH_SECRET_SENTINEL',
      'DISCARDED_WS_TICKET_SECRET_SENTINEL',
      origin,
      'test-operator',
      'nous',
    ]) assert.equal(serialized.includes(secret), false);
  });
});

test('concurrent refresh verifications use the existing single-generation refresh winner', async () => {
  let refreshCalls = 0;
  let ticketCalls = 0;
  await withCloudServer(async (req, res) => {
    if (req.url === '/auth/native/refresh') {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      json(res, 200, {
        access_token: 'SHARED_ROTATED_ACCESS_SECRET_SENTINEL',
        refresh_token: 'SHARED_ROTATED_REFRESH_SECRET_SENTINEL',
        token_type: 'Bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        provider: 'nous',
        user_id: 'test-operator',
      });
      return;
    }
    if (req.url === '/api/auth/ws-ticket') {
      ticketCalls += 1;
      assert.equal(req.headers.authorization, 'Bearer SHARED_ROTATED_ACCESS_SECRET_SENTINEL');
      json(res, 200, {ticket: 'DISCARDED_SHARED_TICKET_SENTINEL', ttl_seconds: 30});
      return;
    }
    json(res, 404, {error: 'not_found'});
  }, async () => {
    const [first, second] = await Promise.all([
      call({action: 'verify_hermes_refresh'}),
      call({action: 'verify_hermes_refresh'}),
    ]);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(first.body, {refreshed: true, persisted: true, bearer_verified: true});
    assert.deepEqual(second.body, {refreshed: true, persisted: true, bearer_verified: true});
    assert.equal(refreshCalls, 1);
    assert.equal(ticketCalls, 2);
    const persisted = await readCredentialRecord();
    assert.equal(persisted.value.generation, 2);
    assert.equal(persisted.value.access_token, 'SHARED_ROTATED_ACCESS_SECRET_SENTINEL');
    assert.equal(persisted.value.refresh_token, 'SHARED_ROTATED_REFRESH_SECRET_SENTINEL');
  });
});

test('refresh verification returns a sanitized failure and never claims a failed rotation succeeded', async () => {
  let ticketCalls = 0;
  await withCloudServer(async (req, res) => {
    if (req.url === '/auth/native/refresh') {
      json(res, 503, {error: 'upstream failed with REFRESH_SECRET_SENTINEL'});
      return;
    }
    if (req.url === '/api/auth/ws-ticket') ticketCalls += 1;
    json(res, 404, {error: 'not_found'});
  }, async ({origin}) => {
    const before = await readCredentialRecord();
    const res = await call({action: 'verify_hermes_refresh'});
    const after = await readCredentialRecord();
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {error: 'Hermes credential refresh verification failed.'});
    assert.equal(after.value.generation, before.value.generation);
    assert.equal(after.value.access_token, before.value.access_token);
    assert.equal(ticketCalls, 0);
    const serialized = JSON.stringify(res.body);
    for (const secret of [
      'ACCESS_SECRET_SENTINEL',
      'REFRESH_SECRET_SENTINEL',
      origin,
      'upstream failed',
      'ROTATED_',
    ]) assert.equal(serialized.includes(secret), false);
  });
});

test('private-state validation checks fresh-read/CAS/create-conflict semantics and cleans its probe', async () => {
  const res = await call({ action: 'verify_state_store' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.verified, true);
  assert.deepEqual(res.body.checks, { create: true, consistent_read: true,
    conditional_writes: true, create_conflict: true, cleanup: true });
});

test('private-state failures identify only a safe stage and category', async () => {
  stateStore.readVersionedJson = async () => {
    throw new Error('Private provider failure SECRET_SENTINEL https://internal.invalid');
  };
  const res = await call({action: 'verify_state_store'});
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {error: 'Private state verification failed.',
    stage: 'consistent_read', kind: 'storage_error'});
  assert.equal(JSON.stringify(res.body).includes('SECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(res.body).includes('internal.invalid'), false);
});

test('private-state validation rejects a duplicate create that changes the stored row', async () => {
  const original = stateStore.compareAndSwapJson.bind(stateStore);
  stateStore.compareAndSwapJson = async (path, version, value) => {
    if (version === null && await stateStore.readVersionedJson(path)) {
      await stateStore.writeJson(path, value);
      return false;
    }
    return original(path, version, value);
  };
  const res = await call({action: 'verify_state_store'});
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.stage, 'create_conflict');
  assert.equal(res.body.kind, 'verification_failed');
  assert.equal(res.body.verified, undefined);
});

test('operator authorization inspection returns only fixed flags without refreshing', async () => {
  assert.equal((await call({action: 'inspect_hermes_auth'}, false)).statusCode, 401);
  await persistCredentials(credentials());
  const res = await call({action: 'inspect_hermes_auth'});
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {connected: true, refresh: 'none', expired: false, weak_version: false});
  assert.equal(JSON.stringify(res.body).includes('SECRET_SENTINEL'), false);
  assert.equal((await call({action: 'inspect_hermes_auth', path: 'arbitrary'})).statusCode, 400);
});
