'use strict';

const crypto = require('node:crypto');
const http = require('node:http');
const {
  normalizeCloudOrigin,
  normalizeCredentialPayload,
} = require('../lib/hermes-cloud-auth');

const DEFAULT_AUTH_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_AUTH_TIMEOUT_MS = 15 * 60 * 1000;

function authTimeoutMs() {
  const value = Number.parseInt(String(process.env.HERMES_AUTH_TIMEOUT_MS || ''), 10);
  return Number.isSafeInteger(value) && value >= 30000 && value <= MAX_AUTH_TIMEOUT_MS
    ? value
    : DEFAULT_AUTH_TIMEOUT_MS;
}

function normalizePublicOrigin(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('M2_PUBLIC_ORIGIN is required.');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('M2_PUBLIC_ORIGIN is invalid.'); }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('M2_PUBLIC_ORIGIN is invalid.');
  }
  return url.origin;
}

function createPkceMaterial() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge, state };
}

function buildAuthorizationUrl(cloudOrigin, redirectUri, material, provider = '') {
  const url = new URL('/auth/native/authorize', cloudOrigin);
  if (provider) url.searchParams.set('provider', provider);
  url.searchParams.set('code_challenge', material.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', material.state);
  return url.href;
}

function htmlResponse(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`<!doctype html><meta charset="utf-8"><title>Hermes authorization</title><p>${body}</p>`);
}

async function listenForLoopbackCode(server, expectedState, timeoutMs = DEFAULT_AUTH_TIMEOUT_MS) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind the Hermes loopback callback.');
  const redirectUri = `http://127.0.0.1:${address.port}/cb`;
  let timer;
  let doneTimer;
  let codeAccepted = false;
  let resolveDone;
  const donePromise = new Promise((resolve) => { resolveDone = resolve; });
  const codePromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      resolveDone(false);
      reject(new Error('Hermes authorization timed out.'));
    }, timeoutMs);
    server.on('request', (req, res) => {
      let url;
      try { url = new URL(req.url || '/', redirectUri); } catch {
        htmlResponse(res, 400, 'Invalid authorization callback.');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/done' && !url.search && codeAccepted) {
        htmlResponse(res, 200, 'Authorization received. Return to the terminal while it completes.');
        clearTimeout(doneTimer);
        resolveDone(true);
        return;
      }
      if (req.method !== 'GET' || url.pathname !== '/cb') {
        htmlResponse(res, 404, 'Invalid authorization callback.');
        return;
      }
      if (codeAccepted) {
        htmlResponse(res, 400, 'This authorization callback was already used.');
        return;
      }
      const state = url.searchParams.get('state') || '';
      if (!state || state !== expectedState) {
        htmlResponse(res, 400, 'Authorization state did not match. Return to the terminal and retry.');
        return;
      }
      const authError = url.searchParams.get('error');
      const code = url.searchParams.get('code') || '';
      if (authError || !code || code.length > 4096) {
        htmlResponse(res, 400, 'Authorization was not completed. Return to the terminal and retry.');
        clearTimeout(timer);
        resolveDone(false);
        reject(new Error('Hermes authorization was not completed.'));
        return;
      }
      codeAccepted = true;
      clearTimeout(timer);
      res.writeHead(302, { location: '/done', 'cache-control': 'no-store' });
      res.end();
      doneTimer = setTimeout(() => resolveDone(false), 15000);
      resolve(code);
    });
  });
  return { redirectUri, codePromise, donePromise };
}

async function postJson(url, body, headers = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'manual',
    });
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 64 * 1024) {
          await reader.cancel();
          throw new Error('Authorization response exceeded the size limit.');
        }
        chunks.push(Buffer.from(value));
      }
      text = Buffer.concat(chunks, size).toString('utf8');
    }
    if (!response.ok) throw new Error('Hermes authorization request failed.');
    if (!text) return null;
    try { return JSON.parse(text); } catch { throw new Error('Hermes authorization returned invalid data.'); }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Hermes authorization request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runAuthorization(options = {}) {
  const cloudOrigin = normalizeCloudOrigin(options.cloudOrigin || process.env.HERMES_CLOUD_ORIGIN);
  const publicOrigin = normalizePublicOrigin(options.publicOrigin || process.env.M2_PUBLIC_ORIGIN);
  const operatorToken = options.operatorToken || process.env.M2_OPERATOR_TOKEN;
  const operatorTokenBytes = typeof operatorToken === 'string' ? Buffer.byteLength(operatorToken, 'utf8') : 0;
  if (typeof operatorToken !== 'string' || operatorToken.trim() !== operatorToken
    || operatorTokenBytes < 32 || operatorTokenBytes > 512 || /\s/.test(operatorToken)) {
    throw new Error('M2_OPERATOR_TOKEN is missing or invalid.');
  }
  const material = createPkceMaterial();
  const server = http.createServer();
  let callback = null;
  try {
    callback = await listenForLoopbackCode(server, material.state, options.timeoutMs || authTimeoutMs());
    const authorizationUrl = buildAuthorizationUrl(cloudOrigin, callback.redirectUri, material, options.provider || '');
    (options.write || console.log)(`Open this Hermes Cloud authorization URL in your browser:\n${authorizationUrl}`);
    const code = await callback.codePromise;
    if (!(await callback.donePromise)) throw new Error('Hermes authorization browser callback did not reach its clean completion page.');
    // Native codes are single-use and consumed on every exchange path. Never retry this POST.
    const tokenPayload = await postJson(new URL('/auth/native/token', cloudOrigin), {
      code,
      code_verifier: material.verifier,
    }, {}, options.requestTimeoutMs || 15000);
    const credentials = normalizeCredentialPayload({ ...tokenPayload, cloud_origin: cloudOrigin }, cloudOrigin);
    // The token response goes directly from this local process to the authenticated operator API.
    // It is never printed or written to a local file.
    await postJson(new URL('/api/native-bootstrap', publicOrigin), {
      action: 'store_hermes_credentials',
      credentials,
    }, { authorization: `Bearer ${operatorToken}` }, options.requestTimeoutMs || 15000);
    (options.write || console.log)('Hermes Cloud credentials stored.');
    return { stored: true, provider: credentials.provider };
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) {
  runAuthorization().catch((error) => {
    process.stderr.write(`${error?.message || 'Hermes authorization failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildAuthorizationUrl,
  createPkceMaterial,
  listenForLoopbackCode,
  normalizePublicOrigin,
  runAuthorization,
};
