'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { MemoryStateStore } = require('../../lib/state-store');
const operatorHandler = require('../../api/operator');
const oauthHandler = require('../../api/oauth');
const {
  authenticateMcpRequest,
  authenticateOperatorRequest,
  getMcpAuthChallenge,
  getMcpResource,
  isM2Configured,
  setMcpAuthDependenciesForTests,
} = require('../../lib/mcp-auth');

const ORIGIN = 'https://m2.example.test';
const OPERATOR_TOKEN = 'test-operator-token-with-32-or-more-random-bytes';
const RESOURCE = ORIGIN + '/mcp';
const REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    raw: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(body) { this.raw = body == null ? '' : String(body); },
  };
}

function jsonResponse(res) {
  return res.headers['content-type']?.startsWith('application/json')
    ? JSON.parse(res.raw || '{}')
    : {};
}

async function invokeOAuth(method, url, body, headers = {}) {
  const req = { method, url, body, headers };
  const res = mockResponse();
  await oauthHandler(req, res);
  return { req, res, json: jsonResponse(res) };
}

async function invokeOperator(method, url, body, headers = {}) {
  const req = { method, url, body, headers };
  const res = mockResponse();
  await operatorHandler(req, res);
  return { req, res, json: jsonResponse(res) };
}

function flowHarness(t, { operatorToken = OPERATOR_TOKEN } = {}) {
  const store = new MemoryStateStore();
  const clock = { value: 1_800_000_000_000 };
  const env = { M2_PUBLIC_ORIGIN: ORIGIN };
  if (operatorToken) env.M2_OPERATOR_TOKEN = operatorToken;
  setMcpAuthDependenciesForTests({ store, now: () => clock.value, env });
  t.after(() => setMcpAuthDependenciesForTests(null));
  return { store, clock, env };
}

async function registerClient({ redirect = REDIRECT, extra = {} } = {}) {
  const result = await invokeOAuth('POST', '/api/oauth/register', {
    client_name: 'ChatGPT connector',
    redirect_uris: [redirect],
    ...extra,
  });
  return { ...result, clientId: result.json.client_id };
}

async function beginAuthorization(clientId, {
  redirect = REDIRECT,
  resource = RESOURCE,
  state = 'state-0123456789-abcdefghijklmnopqrstuvwxyz',
  verifier = 'v'.repeat(43),
} = {}) {
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'mcp:tools',
    resource,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const result = await invokeOAuth('GET', '/api/oauth/authorize?' + params);
  const requestIdMatch = /const requestId=("[A-Za-z0-9_-]{22}")/.exec(result.res.raw);
  const cookie = result.res.headers['set-cookie']?.split(';', 1)[0] || '';
  return {
    ...result,
    requestId: requestIdMatch ? JSON.parse(requestIdMatch[1]) : null,
    cookie,
    verifier,
    state,
    redirect,
    resource,
    clientId,
  };
}

async function approveRequest(flow) {
  const auth = { authorization: 'Bearer ' + OPERATOR_TOKEN };
  const details = await invokeOperator(
    'GET',
    '/api/operator/requests?request_id=' + encodeURIComponent(flow.requestId),
    undefined,
    auth,
  );
  const approved = await invokeOperator(
    'POST',
    '/api/operator/approve',
    { request_id: flow.requestId },
    auth,
  );
  return { details, approved };
}

async function completeAuthorization(flow) {
  return invokeOAuth(
    'GET',
    '/api/oauth/complete?request_id=' + encodeURIComponent(flow.requestId),
    undefined,
    { cookie: flow.cookie },
  );
}

async function createApprovedFlow(t) {
  flowHarness(t);
  const client = await registerClient();
  assert.equal(client.res.statusCode, 201);
  const flow = await beginAuthorization(client.clientId);
  assert.equal(flow.res.statusCode, 200);
  assert.ok(flow.requestId);
  await approveRequest(flow);
  return flow;
}

async function exchangeCode(flow, changes = {}) {
  return invokeOAuth('POST', '/api/oauth/token', {
    grant_type: 'authorization_code',
    code: flow.code,
    client_id: flow.clientId,
    redirect_uri: flow.redirect,
    code_verifier: flow.verifier,
    resource: flow.resource,
    ...changes,
  });
}

async function getCode(flow) {
  const result = await completeAuthorization(flow);
  if (!result.res.headers.location) {
    throw new Error('Authorization completion failed with HTTP ' + result.res.statusCode
      + ' (' + (result.json.error || 'no location') + ').');
  }
  const target = new URL(result.res.headers.location);
  return { ...result, code: target.searchParams.get('code'), target };
}

test('public OAuth metadata and challenge use the configured issuer without exposing credentials', async (t) => {
  const { env } = flowHarness(t, { operatorToken: '' });
  assert.equal(isM2Configured(), true);
  assert.equal(authenticateOperatorRequest({ headers: { authorization: 'Bearer ' + OPERATOR_TOKEN } }), false);
  assert.equal(getMcpResource(), RESOURCE);
  assert.equal(
    getMcpAuthChallenge(),
    'Bearer resource_metadata="' + ORIGIN + '/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"',
  );

  const resource = await invokeOAuth('GET', '/.well-known/oauth-protected-resource/mcp');
  assert.equal(resource.res.statusCode, 200);
  assert.equal(resource.json.resource, RESOURCE);
  assert.deepEqual(resource.json.authorization_servers, [ORIGIN]);
  const server = await invokeOAuth('GET', '/.well-known/oauth-authorization-server');
  assert.equal(server.res.statusCode, 200);
  assert.equal(server.json.authorization_response_iss_parameter_supported, true);
  assert.equal(server.json.authorization_endpoint, ORIGIN + '/oauth/authorize');
  assert.equal(server.res.headers['cache-control'], 'no-store');
  assert.equal(env.M2_OPERATOR_TOKEN, undefined);
});

test('dynamic registration permits only canonical ChatGPT HTTPS callback URIs and public clients', async (t) => {
  flowHarness(t);
  const accepted = await registerClient({ redirect: 'https://chatgpt.com/connector/oauth/callback_01-abc' });
  assert.equal(accepted.res.statusCode, 201);
  assert.equal(accepted.json.token_endpoint_auth_method, 'none');

  for (const redirect of [
    'http://chatgpt.com/connector_platform_oauth_redirect',
    'https://localhost/connector_platform_oauth_redirect',
    'https://evil.example/connector_platform_oauth_redirect',
    'https://chatgpt.com.evil.example/connector_platform_oauth_redirect',
    'https://chatgpt.com/connector/oauth/',
    'https://chatgpt.com/connector/oauth/callback?next=https://evil.example',
    'https://chatgpt.com/connector/oauth/callback#fragment',
  ]) {
    const rejected = await registerClient({ redirect });
    assert.equal(rejected.res.statusCode, 400, redirect);
  }

  const secretMethod = await registerClient({ extra: { token_endpoint_auth_method: 'client_secret_basic' } });
  assert.equal(secretMethod.res.statusCode, 400);
  const extraClientSecret = await registerClient({ extra: { client_secret: 'never-accept-this' } });
  assert.equal(extraClientSecret.res.statusCode, 400);
});

test('OAuth Vercel route query accepts only a canonical OAuth endpoint path', async (t) => {
  flowHarness(t);
  const request = {
    method: 'POST',
    url: '/api/oauth?route=%2Foauth%2Fregister',
    query: { route: '/oauth/register' },
    body: { redirect_uris: [REDIRECT] },
    headers: {},
  };
  const accepted = mockResponse();
  await oauthHandler(request, accepted);
  assert.equal(accepted.statusCode, 201);

  const rejected = await invokeOAuth('POST', '/api/oauth?route=%2Foperator%2Fapprove', {});
  assert.equal(rejected.res.statusCode, 404);
  const duplicated = await invokeOAuth(
    'POST',
    '/api/oauth?route=%2Foauth%2Fregister&route=%2Foauth%2Ftoken',
    { redirect_uris: [REDIRECT] },
  );
  assert.equal(duplicated.res.statusCode, 404);
});

test('approval requires the protected operator Bearer API and the browser receives only its bound code', async (t) => {
  flowHarness(t);
  const client = await registerClient();
  const flow = await beginAuthorization(client.clientId);
  assert.equal(flow.res.statusCode, 200);
  assert.match(flow.res.headers['content-security-policy'], /default-src 'none'/);
  assert.doesNotMatch(flow.res.raw, /<button|<form/i);

  const unauthenticatedGet = await invokeOperator('GET', '/api/operator/requests?request_id=' + flow.requestId);
  assert.equal(unauthenticatedGet.res.statusCode, 401);
  const unauthenticatedApprove = await invokeOperator(
    'POST', '/api/operator/approve', { request_id: flow.requestId },
  );
  assert.equal(unauthenticatedApprove.res.statusCode, 401);
  assert.equal((await completeAuthorization(flow)).res.statusCode, 409);

  const { details, approved } = await approveRequest(flow);
  assert.equal(details.res.statusCode, 200);
  assert.equal(details.json.request.status, 'pending');
  assert.equal(approved.res.statusCode, 200);
  assert.doesNotMatch(details.res.raw + approved.res.raw, /access_token|refresh_token|authorization_code/i);
  const completed = await getCode(flow);
  assert.equal(completed.res.statusCode, 302);
  assert.equal(completed.target.searchParams.get('state'), flow.state);
  assert.equal(completed.target.searchParams.get('iss'), ORIGIN);
  assert.ok(completed.code);
  assert.notEqual(completed.code, flow.requestId);
  flow.code = completed.code;
  const token = await exchangeCode(flow);
  assert.equal(token.res.statusCode, 200);
  assert.equal(token.json.scope, 'mcp:tools');
  assert.equal(token.json.resource, RESOURCE);
  assert.equal(token.json.expires_in, 1800);
  assert.equal(token.res.headers['cache-control'], 'no-store');
});

test('authorization rejects unregistered redirects and mismatched resources', async (t) => {
  flowHarness(t);
  const client = await registerClient();
  const unregistered = await beginAuthorization(client.clientId, {
    redirect: 'https://chatgpt.com/connector/oauth/not-registered',
  });
  assert.equal(unregistered.res.statusCode, 400);
  const wrongResource = await beginAuthorization(client.clientId, { resource: 'https://other.example/mcp' });
  assert.equal(wrongResource.res.statusCode, 400);
});

test('authorization-code exchange rejects bad PKCE, redirect and resource and consumes a valid code once', async (t) => {
  const flow = await createApprovedFlow(t);
  const completed = await getCode(flow);
  assert.equal(completed.res.statusCode, 302);
  flow.code = completed.code;

  assert.equal((await exchangeCode(flow, { code_verifier: 'wrong-verifier-that-is-long-enough-to-parse' })).res.statusCode, 400);
  assert.equal((await exchangeCode(flow, { redirect_uri: 'https://chatgpt.com/connector/oauth/other' })).res.statusCode, 400);
  assert.equal((await exchangeCode(flow, { resource: 'https://wrong.example/mcp' })).res.statusCode, 400);
  const success = await exchangeCode(flow);
  assert.equal(success.res.statusCode, 200);
  const duplicate = await exchangeCode(flow);
  assert.equal(duplicate.res.statusCode, 400);
  assert.equal(duplicate.json.error, 'invalid_grant');
});

test('expired authorization codes fail before access-token issuance', async (t) => {
  const { clock } = flowHarness(t);
  const client = await registerClient();
  const flow = await beginAuthorization(client.clientId);
  await approveRequest(flow);
  const completed = await getCode(flow);
  flow.code = completed.code;
  clock.value += 5 * 60 * 1000 + 1;

  const result = await exchangeCode(flow);
  assert.equal(result.res.statusCode, 400);
  assert.equal(result.json.error, 'invalid_grant');
});

test('concurrent authorization-code exchanges issue at most one token pair', async (t) => {
  const flow = await createApprovedFlow(t);
  const completed = await getCode(flow);
  flow.code = completed.code;

  const [first, second] = await Promise.all([exchangeCode(flow), exchangeCode(flow)]);
  assert.deepEqual([first.res.statusCode, second.res.statusCode].sort(), [200, 400]);
});

test('access is fixed to the active scope and refresh tokens rotate atomically', async (t) => {
  const { store, clock } = flowHarness(t);
  const client = await registerClient();
  const flow = await beginAuthorization(client.clientId);
  await approveRequest(flow);
  const completed = await getCode(flow);
  flow.code = completed.code;
  const issued = await exchangeCode(flow);
  const accessToken = issued.json.access_token;
  const refreshToken = issued.json.refresh_token;

  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + accessToken } }), true);
  const tokenId = accessToken.split('.')[1];
  const path = 'mcp-oauth/tokens/' + tokenId;
  let stored = await store.readVersionedJson(path);
  assert.equal(stored.value.scope, 'mcp:tools');
  assert.equal(await store.compareAndSwapJson(path, stored.version, { ...stored.value, scope: 'mcp:admin' }), true);
  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + accessToken } }), false);
  stored = await store.readVersionedJson(path);
  assert.equal(await store.compareAndSwapJson(path, stored.version, { ...stored.value, scope: 'mcp:tools' }), true);
  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + accessToken } }), true);

  const refreshRequest = () => invokeOAuth('POST', '/api/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: flow.clientId,
    resource: RESOURCE,
    scope: 'mcp:tools',
  });
  const [left, right] = await Promise.all([refreshRequest(), refreshRequest()]);
  assert.deepEqual([left.res.statusCode, right.res.statusCode].sort(), [200, 400]);
  const rotated = left.res.statusCode === 200 ? left : right;
  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + accessToken } }), false);
  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + rotated.json.access_token } }), true);
  assert.equal((await refreshRequest()).res.statusCode, 400);

  clock.value += 30 * 60 * 1000 + 1;
  assert.equal(await authenticateMcpRequest({ headers: { authorization: 'Bearer ' + rotated.json.access_token } }), false);
});

test('authorization and refresh races do not leak codes or token material to state, consent, admin, or errors', async (t) => {
  const { store } = flowHarness(t);
  const client = await registerClient();
  const flow = await beginAuthorization(client.clientId);
  assert.doesNotMatch(flow.res.raw, /m2[arf]\./);
  await approveRequest(flow);
  const completed = await getCode(flow);
  flow.code = completed.code;
  assert.doesNotMatch(JSON.stringify([...store.values.entries()]), new RegExp(flow.code));
  const issued = await exchangeCode(flow);
  assert.equal(issued.res.statusCode, 200);
  const storedJson = JSON.stringify([...store.values.entries()]);
  assert.doesNotMatch(storedJson, new RegExp(issued.json.access_token));
  assert.doesNotMatch(storedJson, new RegExp(issued.json.refresh_token));

  const error = await invokeOAuth('POST', '/api/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: issued.json.refresh_token.slice(0, -1) + 'x',
    client_id: flow.clientId,
    resource: RESOURCE,
  });
  assert.equal(error.res.statusCode, 400);
  assert.doesNotMatch(error.res.raw, /m2[arf]\./);
  const admin = await invokeOperator(
    'GET',
    '/api/operator/requests?request_id=' + flow.requestId,
    undefined,
    { authorization: 'Bearer ' + OPERATOR_TOKEN },
  );
  assert.doesNotMatch(admin.res.raw, /m2[arf]\.|access_token|refresh_token/i);
});

test('oversized registration and operator payloads fail with bounded safe errors', async (t) => {
  flowHarness(t);
  const oversizedRegistration = await invokeOAuth('POST', '/api/oauth/register', {
    redirect_uris: [REDIRECT],
    client_name: 'x'.repeat(13 * 1024),
  });
  assert.equal(oversizedRegistration.res.statusCode, 413);
  assert.deepEqual(oversizedRegistration.json, { error: 'invalid_client_metadata' });

  const oversizedApproval = await invokeOperator(
    'POST',
    '/api/operator/approve',
    { request_id: 'A'.repeat(5 * 1024) },
    { authorization: 'Bearer ' + OPERATOR_TOKEN },
  );
  assert.equal(oversizedApproval.res.statusCode, 413);
  assert.deepEqual(oversizedApproval.json, { error: 'invalid_request' });
});
