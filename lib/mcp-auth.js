'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const { getStateStore } = require('./state-store');
const { readBody, readJson, sendHtml, sendJson } = require('./http');

const SCOPE = 'mcp:tools';
const STATE_PREFIX = 'mcp-oauth';
const MAX_JSON_BYTES = 12 * 1024;
const MAX_FORM_BYTES = 8 * 1024;
const MAX_URL_LENGTH = 8 * 1024;
const MAX_PENDING_AGE_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 30 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORE_TIMEOUT_MS = 9 * 1000;
const COOKIE_PREFIX = '__Host-m2_oauth_wait_';
const NO_STORE = Object.freeze({
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

let testDependencies = null;
const rateLimits = new Map();

class OAuthProblem extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function now() {
  return testDependencies?.now ? testDependencies.now() : Date.now();
}

function randomBase64Url(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

function randomPathId(size = 16) {
  let value;
  do {
    value = randomBase64Url(size);
  } while (!/^[A-Za-z0-9]/.test(value));
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('base64url');
}

function constantTimeTextEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftHash = crypto.createHash('sha256').update(left, 'utf8').digest();
  const rightHash = crypto.createHash('sha256').update(right, 'utf8').digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function getConfiguration({ requireOperator = true } = {}) {
  const env = testDependencies?.env || process.env;
  const rawOrigin = typeof env.M2_PUBLIC_ORIGIN === 'string' ? env.M2_PUBLIC_ORIGIN : '';
  const operatorToken = typeof env.M2_OPERATOR_TOKEN === 'string' ? env.M2_OPERATOR_TOKEN : '';
  const invalidOperatorToken = requireOperator && (!operatorToken
    || Buffer.byteLength(operatorToken, 'utf8') < 32
    || Buffer.byteLength(operatorToken, 'utf8') > 512
    || /\s/.test(operatorToken));
  if (!rawOrigin || rawOrigin.length > 256
      || invalidOperatorToken) {
    throw new Error('M2 OAuth configuration is unavailable.');
  }

  let parsed;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error('M2 OAuth configuration is unavailable.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
      || parsed.pathname !== '/' || parsed.search || parsed.hash
      || (rawOrigin !== parsed.origin && rawOrigin !== `${parsed.origin}/`)
      || !hostname || net.isIP(hostname) || hostname === 'localhost'
      || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('M2 OAuth configuration is unavailable.');
  }

  return {
    origin: parsed.origin,
    resource: `${parsed.origin}/mcp`,
    operatorToken,
  };
}

function isM2Configured() {
  const env = testDependencies?.env || process.env;
  return Object.hasOwn(env, 'M2_PUBLIC_ORIGIN') || Object.hasOwn(env, 'HERMES_CLOUD_ORIGIN');
}

function getMcpResource() {
  try {
    return getConfiguration({ requireOperator: false }).resource;
  } catch {
    return null;
  }
}

function getMcpAuthChallenge() {
  try {
    const config = getConfiguration({ requireOperator: false });
    return `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`;
  } catch {
    return null;
  }
}

function getStore() {
  return testDependencies?.store || getStateStore();
}

async function withStoreDeadline(promise) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('State store timed out.')), STORE_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readRecord(path) {
  return withStoreDeadline(getStore().readVersionedJson(path));
}

async function compareAndSwap(path, version, value) {
  return withStoreDeadline(getStore().compareAndSwapJson(path, version, value));
}

function clientPath(clientId) {
  return `${STATE_PREFIX}/clients/${clientId}`;
}

function pendingPath(requestId) {
  return `${STATE_PREFIX}/pending/${requestId}`;
}

function tokenPath(tokenId) {
  return `${STATE_PREFIX}/tokens/${tokenId}`;
}

function allowedRedirectUri(value) {
  if (typeof value !== 'string' || value.length > 256) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== 'https://chatgpt.com' || url.username || url.password
      || url.port || url.search || url.hash || value !== url.href) return false;
  return url.pathname === '/connector_platform_oauth_redirect'
    || /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname);
}

function requestUrl(req) {
  const raw = typeof req?.url === 'string' ? req.url : '/';
  if (raw.length > MAX_URL_LENGTH) throw new OAuthProblem(414, 'invalid_request');
  try {
    return new URL(raw, getConfiguration().origin);
  } catch {
    throw new OAuthProblem(400, 'invalid_request');
  }
}

function normalizeRoute(route, req, apiPrefix) {
  const raw = typeof route === 'string' && route ? route : (req?.url || '/');
  let pathname;
  try {
    pathname = new URL(raw, 'https://route.invalid').pathname;
  } catch {
    return '';
  }
  if (apiPrefix && (pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`))) {
    pathname = pathname.slice(apiPrefix.length) || '/';
  }
  return pathname;
}

function singleQueryValue(url, name, required = false) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1 || (required && values.length !== 1)) {
    throw new OAuthProblem(400, 'invalid_request');
  }
  return values[0] ?? '';
}

function validateRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

function validateClientId(value) {
  return typeof value === 'string' && /^m2cli_[A-Za-z0-9_-]{32}$/.test(value);
}

function validState(value) {
  return typeof value === 'string' && value.length <= 512
    && /^[\x21-\x7e]+$/.test(value);
}

function validChallenge(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length === 32 && decoded.toString('base64url') === value;
  } catch {
    return false;
  }
}

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()] ?? req?.headers?.[name];
  return typeof value === 'string' ? value : '';
}

function bearerValue(req) {
  const authorization = header(req, 'authorization');
  if (authorization.length > 1024) return '';
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match ? match[1] : '';
}

function authenticateOperatorRequest(req) {
  try {
    const config = getConfiguration();
    const presented = bearerValue(req);
    return constantTimeTextEqual(presented, config.operatorToken);
  } catch {
    return false;
  }
}

function safeJson(res, status, body, headers = {}) {
  return sendJson(res, status, body, { ...NO_STORE, ...headers });
}

function oauthError(res, status, code) {
  return safeJson(res, status, { error: code });
}

function methodNotAllowed(res, allow) {
  return safeJson(res, 405, { error: 'invalid_request' }, { Allow: allow });
}

function safeStatus(error) {
  return Number.isInteger(error?.statusCode) && [408, 413].includes(error.statusCode)
    ? error.statusCode
    : 400;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateNoExtraKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validateStringArray(value, { min = 1, max = 4, maxLength = 256 } = {}) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every((item) => typeof item === 'string' && item.length <= maxLength);
}

function rateLimitKey(req, prefix, identity = '') {
  const forwarded = header(req, 'x-forwarded-for').split(',')[0].trim();
  const address = (forwarded || req?.socket?.remoteAddress || 'unknown').slice(0, 128);
  return `${prefix}:${identity || address}`;
}

function allowRate(req, prefix, identity, maxHits, windowMs = 60_000) {
  const timestamp = now();
  if (rateLimits.size > 512) {
    for (const [key, entry] of rateLimits) {
      if (entry.resetAt <= timestamp) rateLimits.delete(key);
    }
    while (rateLimits.size > 512) rateLimits.delete(rateLimits.keys().next().value);
  }
  const key = rateLimitKey(req, prefix, identity);
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= timestamp) {
    rateLimits.set(key, { count: 1, resetAt: timestamp + windowMs });
    return true;
  }
  if (entry.count >= maxHits) return false;
  entry.count += 1;
  return true;
}

function cookieName(requestId) {
  return `${COOKIE_PREFIX}${requestId}`;
}

function readCookie(req, name) {
  const raw = header(req, 'cookie');
  if (!raw || raw.length > 8 * 1024) return '';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    const value = trimmed.slice(name.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
  }
  return '';
}

function pendingMatchesBrowser(req, pending) {
  const secret = readCookie(req, cookieName(pending.request_id));
  return Boolean(secret && constantTimeTextEqual(sha256(secret), pending.wait_hash));
}

function consentHtml(requestId) {
  const nonce = randomBase64Url(18);
  const safeId = JSON.stringify(requestId).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Waiting for operator approval</title></head><body><main><h1>Waiting for operator approval</h1><p>This request has not been approved. The operator must review and approve it through the protected operator API.</p><p>Request ID: <code id="request-id"></code></p><p id="status" role="status">Waiting…</p></main><script nonce="${nonce}">const requestId=${safeId};document.getElementById('request-id').textContent=requestId;const statusNode=document.getElementById('status');let stopped=false;async function poll(){if(stopped)return;try{const response=await fetch('/oauth/status?request_id='+encodeURIComponent(requestId),{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error('pending');const result=await response.json();if(result.status==='approved'){stopped=true;statusNode.textContent='Approved. Returning to ChatGPT…';window.location.replace('/oauth/complete?request_id='+encodeURIComponent(requestId));return;}if(result.status==='expired'){stopped=true;statusNode.textContent='This authorization request expired. Restart the connection in ChatGPT.';return;}}catch{statusNode.textContent='Waiting for operator approval…';}setTimeout(poll,1500);}setTimeout(poll,1000);</script></body></html>`;
  return { html, nonce };
}

function sendConsentPage(res, requestId, waitSecret) {
  const { html, nonce } = consentHtml(requestId);
  const cookie = `${cookieName(requestId)}=${waitSecret}; Max-Age=${Math.ceil(MAX_PENDING_AGE_MS / 1000)}; Path=/; Secure; HttpOnly; SameSite=Strict`;
  return sendHtml(res, 200, html, {
    ...NO_STORE,
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'`,
    'Set-Cookie': cookie,
  });
}

async function handleMetadata(req, res, route, config) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (route === '/.well-known/oauth-protected-resource'
      || route === '/.well-known/oauth-protected-resource/mcp'
      || route === '/mcp/.well-known/oauth-protected-resource') {
    return safeJson(res, 200, {
      resource: config.resource,
      authorization_servers: [config.origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
    });
  }
  if (route === '/.well-known/oauth-authorization-server') {
    return safeJson(res, 200, {
      issuer: config.origin,
      authorization_endpoint: `${config.origin}/oauth/authorize`,
      token_endpoint: `${config.origin}/oauth/token`,
      registration_endpoint: `${config.origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [SCOPE],
      authorization_response_iss_parameter_supported: true,
    });
  }
  return null;
}

async function handleRegistration(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!allowRate(req, 'register', '', 30)) return oauthError(res, 429, 'too_many_requests');

  let body;
  try {
    body = await readJson(req, MAX_JSON_BYTES);
  } catch (error) {
    return oauthError(res, safeStatus(error), 'invalid_client_metadata');
  }
  const allowedKeys = new Set([
    'client_name', 'redirect_uris', 'grant_types', 'response_types', 'token_endpoint_auth_method',
  ]);
  if (!isPlainObject(body) || !validateNoExtraKeys(body, allowedKeys)
      || !validateStringArray(body.redirect_uris)
      || !body.redirect_uris.every(allowedRedirectUri)) {
    return oauthError(res, 400, 'invalid_client_metadata');
  }
  if (body.client_name !== undefined
      && (typeof body.client_name !== 'string' || !body.client_name.trim()
        || body.client_name.length > 96 || /[\u0000-\u001f\u007f]/.test(body.client_name))) {
    return oauthError(res, 400, 'invalid_client_metadata');
  }
  if (body.grant_types !== undefined
      && (!validateStringArray(body.grant_types, { min: 1, max: 2, maxLength: 32 })
        || !body.grant_types.includes('authorization_code')
        || body.grant_types.some((grant) => !['authorization_code', 'refresh_token'].includes(grant)))) {
    return oauthError(res, 400, 'invalid_client_metadata');
  }
  if (body.response_types !== undefined
      && (!validateStringArray(body.response_types, { min: 1, max: 1, maxLength: 16 })
        || body.response_types[0] !== 'code')) {
    return oauthError(res, 400, 'invalid_client_metadata');
  }
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none') {
    return oauthError(res, 400, 'invalid_client_metadata');
  }

  const clientId = `m2cli_${randomBase64Url(24)}`;
  const record = {
    schema: 1,
    client_id: clientId,
    client_name: body.client_name?.trim() || 'ChatGPT connector',
    redirect_uris: [...new Set(body.redirect_uris)],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    created_at: now(),
  };
  try {
    if (!await compareAndSwap(clientPath(clientId), null, record)) {
      return oauthError(res, 503, 'temporarily_unavailable');
    }
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
  return safeJson(res, 201, {
    client_id: clientId,
    client_name: record.client_name,
    redirect_uris: record.redirect_uris,
    grant_types: record.grant_types,
    response_types: record.response_types,
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(record.created_at / 1000),
  });
}

async function handleAuthorization(req, res, config) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  let url;
  try {
    url = requestUrl(req);
  } catch (error) {
    return oauthError(res, error.status || 400, error.code || 'invalid_request');
  }

  let clientId;
  let redirectUri;
  let scope;
  let resource;
  let state;
  let codeChallenge;
  let challengeMethod;
  try {
    if (singleQueryValue(url, 'response_type', true) !== 'code') throw new OAuthProblem(400, 'unsupported_response_type');
    clientId = singleQueryValue(url, 'client_id', true);
    redirectUri = singleQueryValue(url, 'redirect_uri', true);
    scope = singleQueryValue(url, 'scope', true);
    resource = singleQueryValue(url, 'resource', true);
    state = singleQueryValue(url, 'state', true);
    codeChallenge = singleQueryValue(url, 'code_challenge', true);
    challengeMethod = singleQueryValue(url, 'code_challenge_method', true);
    const prompt = singleQueryValue(url, 'prompt');
    if (prompt && prompt !== 'consent') throw new OAuthProblem(400, 'invalid_request');
  } catch (error) {
    return oauthError(res, error.status || 400, error.code || 'invalid_request');
  }

  if (!validateClientId(clientId) || scope !== SCOPE || resource !== config.resource
      || !validState(state) || challengeMethod !== 'S256' || !validChallenge(codeChallenge)
      || !allowedRedirectUri(redirectUri)) {
    return oauthError(res, 400, 'invalid_request');
  }
  if (!allowRate(req, 'authorize', clientId, 40)) return oauthError(res, 429, 'too_many_requests');

  try {
    const clientRecord = await readRecord(clientPath(clientId));
    const client = clientRecord?.value;
    if (!client || client.client_id !== clientId || !Array.isArray(client.redirect_uris)
        || !client.redirect_uris.includes(redirectUri)) {
      return oauthError(res, 400, 'invalid_client');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const requestId = randomPathId(16);
      const waitSecret = randomBase64Url(32);
      const timestamp = now();
      const pending = {
        schema: 1,
        request_id: requestId,
        status: 'pending',
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: SCOPE,
        resource: config.resource,
        issuer: config.origin,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        wait_hash: sha256(waitSecret),
        created_at: timestamp,
        expires_at: timestamp + MAX_PENDING_AGE_MS,
      };
      if (await compareAndSwap(pendingPath(requestId), null, pending)) {
        return sendConsentPage(res, requestId, waitSecret);
      }
    }
    return oauthError(res, 503, 'temporarily_unavailable');
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function getPendingForBrowser(req, requestId) {
  if (!validateRequestId(requestId)) return null;
  const record = await readRecord(pendingPath(requestId));
  const pending = record?.value;
  if (!pending || pending.request_id !== requestId || !pendingMatchesBrowser(req, pending)) return null;
  return { record, pending };
}

async function handleWaitStatus(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!allowRate(req, 'status', '', 90)) return oauthError(res, 429, 'too_many_requests');
  let requestId;
  try {
    requestId = singleQueryValue(requestUrl(req), 'request_id', true);
  } catch (error) {
    return oauthError(res, error.status || 400, error.code || 'invalid_request');
  }
  try {
    const value = await getPendingForBrowser(req, requestId);
    if (!value) return oauthError(res, 404, 'invalid_request');
    const { pending } = value;
    if (pending.expires_at <= now()) return safeJson(res, 200, { status: 'expired' });
    if (pending.status === 'approved' || pending.status === 'code_issued') {
      return safeJson(res, 200, { status: 'approved' });
    }
    if (pending.status !== 'pending') return safeJson(res, 200, { status: 'expired' });
    return safeJson(res, 200, { status: 'pending' });
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

function redirectToClient(res, pending, authorizationCode) {
  let target;
  try {
    target = new URL(pending.redirect_uri);
    target.searchParams.set('code', authorizationCode);
    target.searchParams.set('state', pending.state);
    target.searchParams.set('iss', pending.issuer);
  } catch {
    return oauthError(res, 400, 'invalid_request');
  }
  res.statusCode = 302;
  for (const [key, value] of Object.entries(NO_STORE)) res.setHeader(key, value);
  res.setHeader('Location', target.toString());
  res.setHeader('Set-Cookie', `${cookieName(pending.request_id)}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`);
  return res.end();
}

async function handleAuthorizationComplete(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!allowRate(req, 'complete', '', 20)) return oauthError(res, 429, 'too_many_requests');
  let requestId;
  try {
    requestId = singleQueryValue(requestUrl(req), 'request_id', true);
  } catch (error) {
    return oauthError(res, error.status || 400, error.code || 'invalid_request');
  }
  try {
    let value = await getPendingForBrowser(req, requestId);
    if (!value) return oauthError(res, 404, 'invalid_request');
    if (value.pending.expires_at <= now()) return oauthError(res, 410, 'invalid_request');

    if (value.pending.status === 'approved') {
      const authorizationCode = `m2c.${requestId}.${randomBase64Url(32)}`;
      const updated = {
        ...value.pending,
        status: 'code_issued',
        code_hash: sha256(authorizationCode),
        code_expires_at: now() + CODE_TTL_MS,
      };
      if (await compareAndSwap(pendingPath(requestId), value.record.version, updated)) {
        return redirectToClient(res, updated, authorizationCode);
      }
      value = await getPendingForBrowser(req, requestId);
      if (!value) return oauthError(res, 409, 'invalid_request');
    }

    if (value.pending.status !== 'code_issued'
        || value.pending.code_expires_at <= now()) {
      return oauthError(res, 409, 'authorization_pending');
    }
    return oauthError(res, 409, 'invalid_request');
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function readTokenForm(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      && !(req.body instanceof Uint8Array)) {
    await readBody(req, MAX_FORM_BYTES);
    if (!isPlainObject(req.body)) throw new OAuthProblem(400, 'invalid_request');
    return req.body;
  }

  const raw = await readBody(req, MAX_FORM_BYTES);
  const params = new URLSearchParams(raw);
  const body = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(body, key)) throw new OAuthProblem(400, 'invalid_request');
    body[key] = value;
  }
  return body;
}

function requestFieldsAreStrings(body, allowed) {
  return validateNoExtraKeys(body, allowed)
    && Object.values(body).every((value) => typeof value === 'string' && value.length <= 2048);
}

function parseCode(value) {
  if (typeof value !== 'string') return null;
  const match = /^m2c\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return match ? { requestId: match[1], value } : null;
}

function parseOpaqueToken(value, prefix) {
  if (typeof value !== 'string') return null;
  const match = new RegExp(`^${prefix}\\.([A-Za-z0-9_-]{22})\\.([A-Za-z0-9_-]{43})$`).exec(value);
  return match ? { tokenId: match[1], value } : null;
}

function createTokenPair(tokenId = randomPathId(16)) {
  const accessToken = `m2a.${tokenId}.${randomBase64Url(32)}`;
  const refreshToken = `m2r.${tokenId}.${randomBase64Url(32)}`;
  return {
    accessToken,
    refreshToken,
    accessHash: sha256(accessToken),
    refreshHash: sha256(refreshToken),
  };
}

function tokenResponse(res, pair, config) {
  return safeJson(res, 200, {
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(ACCESS_TTL_MS / 1000),
    refresh_token: pair.refreshToken,
    scope: SCOPE,
    resource: config.resource,
  });
}

async function exchangeAuthorizationCode(req, res, config, body) {
  const allowed = new Set(['grant_type', 'code', 'client_id', 'redirect_uri', 'code_verifier', 'resource']);
  if (!requestFieldsAreStrings(body, allowed) || body.grant_type !== 'authorization_code'
      || body.resource !== config.resource || !validateClientId(body.client_id)
      || !allowedRedirectUri(body.redirect_uri)) {
    return oauthError(res, 400, 'invalid_grant');
  }
  const parsedCode = parseCode(body.code);
  if (!parsedCode) return oauthError(res, 400, 'invalid_grant');
  const verifier = body.code_verifier;
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128
      || !/^[A-Za-z0-9\-._~]+$/.test(verifier)) {
    return oauthError(res, 400, 'invalid_grant');
  }

  try {
    const stored = await readRecord(pendingPath(parsedCode.requestId));
    const pending = stored?.value;
    if (!pending || pending.status !== 'code_issued'
        || pending.code_expires_at <= now()
        || pending.code_hash !== sha256(parsedCode.value)
        || pending.client_id !== body.client_id
        || pending.redirect_uri !== body.redirect_uri
        || pending.resource !== config.resource
        || pending.scope !== SCOPE
        || !constantTimeTextEqual(crypto.createHash('sha256').update(verifier).digest('base64url'), pending.code_challenge)) {
      return oauthError(res, 400, 'invalid_grant');
    }

    const consumed = {
      ...pending,
      status: 'consumed',
      consumed_at: now(),
      authorization_code: undefined,
      code_hash: undefined,
    };
    delete consumed.authorization_code;
    delete consumed.code_hash;
    if (!await compareAndSwap(pendingPath(parsedCode.requestId), stored.version, consumed)) {
      return oauthError(res, 400, 'invalid_grant');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const pair = createTokenPair();
      const timestamp = now();
      const grant = {
        schema: 1,
        token_id: pair.accessToken.split('.')[1],
        client_id: pending.client_id,
        subject: 'operator',
        scope: SCOPE,
        audience: config.resource,
        access_hash: pair.accessHash,
        access_expires_at: timestamp + ACCESS_TTL_MS,
        refresh_hash: pair.refreshHash,
        refresh_expires_at: timestamp + REFRESH_TTL_MS,
        created_at: timestamp,
      };
      if (await compareAndSwap(tokenPath(grant.token_id), null, grant)) {
        return tokenResponse(res, pair, config);
      }
    }
    return oauthError(res, 503, 'temporarily_unavailable');
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function exchangeRefreshToken(req, res, config, body) {
  const allowed = new Set(['grant_type', 'refresh_token', 'client_id', 'resource', 'scope']);
  if (!requestFieldsAreStrings(body, allowed) || body.grant_type !== 'refresh_token'
      || body.resource !== config.resource || !validateClientId(body.client_id)
      || (body.scope && body.scope !== SCOPE)) {
    return oauthError(res, 400, 'invalid_grant');
  }
  const parsedToken = parseOpaqueToken(body.refresh_token, 'm2r');
  if (!parsedToken) return oauthError(res, 400, 'invalid_grant');

  try {
    const stored = await readRecord(tokenPath(parsedToken.tokenId));
    const grant = stored?.value;
    if (!grant || grant.token_id !== parsedToken.tokenId
        || grant.client_id !== body.client_id
        || grant.refresh_expires_at <= now()
        || grant.audience !== config.resource || grant.scope !== SCOPE
        || !constantTimeTextEqual(grant.refresh_hash, sha256(parsedToken.value))) {
      return oauthError(res, 400, 'invalid_grant');
    }

    const pair = createTokenPair(parsedToken.tokenId);
    const timestamp = now();
    const rotated = {
      ...grant,
      access_hash: pair.accessHash,
      access_expires_at: timestamp + ACCESS_TTL_MS,
      refresh_hash: pair.refreshHash,
      refresh_expires_at: timestamp + REFRESH_TTL_MS,
      rotated_at: timestamp,
    };
    if (!await compareAndSwap(tokenPath(parsedToken.tokenId), stored.version, rotated)) {
      return oauthError(res, 400, 'invalid_grant');
    }
    return tokenResponse(res, pair, config);
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function handleToken(req, res, config) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  let body;
  try {
    body = await readTokenForm(req);
  } catch (error) {
    return oauthError(res, safeStatus(error), 'invalid_request');
  }
  if (!isPlainObject(body)) return oauthError(res, 400, 'invalid_request');
  if (body.grant_type === 'authorization_code') return exchangeAuthorizationCode(req, res, config, body);
  if (body.grant_type === 'refresh_token') return exchangeRefreshToken(req, res, config, body);
  return oauthError(res, 400, 'unsupported_grant_type');
}

async function handleOAuth(req, res, route) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const path = normalizeRoute(route, req, '/api/oauth');
    const metadataRoute = path === '/.well-known/oauth-protected-resource'
      || path === '/.well-known/oauth-protected-resource/mcp'
      || path === '/mcp/.well-known/oauth-protected-resource'
      || path === '/.well-known/oauth-authorization-server';
    if (metadataRoute) {
      const publicConfig = getConfiguration({ requireOperator: false });
      return handleMetadata(req, res, path, publicConfig);
    }
    const config = getConfiguration();
    if (path === '/oauth/register') return handleRegistration(req, res);
    if (path === '/oauth/authorize') return handleAuthorization(req, res, config);
    if (path === '/oauth/status') return handleWaitStatus(req, res);
    if (path === '/oauth/complete') return handleAuthorizationComplete(req, res);
    if (path === '/oauth/token') return handleToken(req, res, config);
    return safeJson(res, 404, { error: 'not_found' });
  } catch (error) {
    if (error instanceof OAuthProblem) return oauthError(res, error.status, error.code);
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

function operatorRoute(req) {
  return normalizeRoute(undefined, req, '/api/operator');
}

function readOperatorRequestId(req) {
  const url = requestUrl(req);
  return singleQueryValue(url, 'request_id', true);
}

function operatorSafeRequest(pending, clientName) {
  return {
    request_id: pending.request_id,
    status: pending.expires_at <= now() && pending.status === 'pending' ? 'expired' : pending.status,
    client_name: clientName,
    redirect_uri: pending.redirect_uri,
    scope: pending.scope,
    resource: pending.resource,
    created_at: pending.created_at,
    expires_at: pending.expires_at,
  };
}

async function getOperatorRequest(req, res) {
  let requestId;
  try {
    requestId = readOperatorRequestId(req);
  } catch (error) {
    return oauthError(res, error.status || 400, error.code || 'invalid_request');
  }
  if (!validateRequestId(requestId)) return oauthError(res, 404, 'not_found');
  try {
    const stored = await readRecord(pendingPath(requestId));
    const pending = stored?.value;
    if (!pending || pending.request_id !== requestId) return oauthError(res, 404, 'not_found');
    const client = await readRecord(clientPath(pending.client_id));
    const name = client?.value?.client_name || 'ChatGPT connector';
    return safeJson(res, 200, { request: operatorSafeRequest(pending, name) });
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function approveOperatorRequest(req, res) {
  let body;
  try {
    body = await readJson(req, 4 * 1024);
  } catch (error) {
    return oauthError(res, safeStatus(error), 'invalid_request');
  }
  if (!isPlainObject(body) || !validateNoExtraKeys(body, new Set(['request_id']))
      || !validateRequestId(body.request_id)) {
    return oauthError(res, 400, 'invalid_request');
  }
  try {
    const stored = await readRecord(pendingPath(body.request_id));
    const pending = stored?.value;
    if (!pending || pending.request_id !== body.request_id
        || pending.status !== 'pending' || pending.expires_at <= now()) {
      return oauthError(res, 409, 'invalid_request');
    }
    const approved = { ...pending, status: 'approved', approved_at: now() };
    if (!await compareAndSwap(pendingPath(body.request_id), stored.version, approved)) {
      return oauthError(res, 409, 'invalid_request');
    }
    return safeJson(res, 200, { request_id: body.request_id, status: 'approved' });
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
}

async function handleOperatorApproval(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let route;
  try {
    route = operatorRoute(req);
  } catch {
    return safeJson(res, 404, { error: 'not_found' });
  }
  const isRead = req.method === 'GET' && (route === '/' || route === '/requests');
  const isApprove = req.method === 'POST' && (route === '/' || route === '/approve');
  if (!isRead && !isApprove) return safeJson(res, 404, { error: 'not_found' });

  try {
    getConfiguration();
  } catch {
    return oauthError(res, 503, 'temporarily_unavailable');
  }
  if (!authenticateOperatorRequest(req)) return oauthError(res, 401, 'unauthorized');
  if (isRead) return getOperatorRequest(req, res);
  return approveOperatorRequest(req, res);
}

async function authenticateMcpRequest(req) {
  try {
    const config = getConfiguration();
    const parsed = parseOpaqueToken(bearerValue(req), 'm2a');
    if (!parsed) return false;
    const stored = await readRecord(tokenPath(parsed.tokenId));
    const grant = stored?.value;
    return Boolean(grant
      && grant.token_id === parsed.tokenId
      && grant.subject === 'operator'
      && grant.scope === SCOPE
      && grant.audience === config.resource
      && grant.access_expires_at > now()
      && constantTimeTextEqual(grant.access_hash, sha256(parsed.value)));
  } catch {
    return false;
  }
}

function setMcpAuthDependenciesForTests(dependencies = null) {
  testDependencies = dependencies;
  rateLimits.clear();
}

module.exports = {
  authenticateMcpRequest,
  authenticateOperatorRequest,
  getMcpAuthChallenge,
  getMcpResource,
  handleOAuth,
  handleOperatorApproval,
  isM2Configured,
  setMcpAuthDependenciesForTests,
};
