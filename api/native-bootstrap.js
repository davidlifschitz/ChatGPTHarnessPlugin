'use strict';

const { randomUUID } = require('node:crypto');
const { authenticateOperatorRequest } = require('../lib/mcp-auth');
const {
  getAccessCredential,
  persistCredentials,
  readCredentialRecord,
  requestCloudJson,
} = require('../lib/hermes-cloud-auth');
const { getStateStore } = require('../lib/state-store');
const { readJson, sendJson } = require('../lib/http');

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

const STORE_PROBE_STAGES = ['create', 'consistent_read', 'conditional_writes', 'create_conflict', 'cleanup', 'cleanup_read'];
const STORE_FAILURE_KINDS = ['storage_error', 'access_denied', 'not_configured', 'version_missing', 'timeout', 'verification_failed', 'conflict'];

async function storageStage(stage, operation) {
  try { return await operation(); }
  catch (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const kind = /timed out|timeout/i.test(message) ? 'timeout'
      : /unauthori[sz]ed|forbidden|access.denied|permission|invalid token|token.*expired/i.test(message) ? 'access_denied'
      : /no.*credentials|no.*token.*found/i.test(message) ? 'not_configured'
      : /version.*unavailable/i.test(message) ? 'version_missing'
      : /already exists|precondition/i.test(message) ? 'conflict'
      : message === 'State verification failed.' ? 'verification_failed' : 'storage_error';
    const safe = new Error('Private state verification failed.');
    safe.probeStage = stage;
    safe.probeKind = kind;
    throw safe;
  }
}

async function verifyStateStore() {
  const store = getStateStore();
  const path = `m2/check/probe-${randomUUID()}`;
  const checks = { create: false, consistent_read: false, conditional_writes: false,
    create_conflict: false, cleanup: false };
  let created = false;
  try {
    created = await storageStage('create', () => store.compareAndSwapJson(path, null, { revision: 1 }));
    checks.create = created;
    if (!created) throw new Error('State verification failed.');
    const first = await storageStage('consistent_read', () => store.readVersionedJson(path));
    checks.consistent_read = first?.value?.revision === 1 && typeof first.version === 'string';
    if (!checks.consistent_read) await storageStage('consistent_read', () => { throw new Error('State verification failed.'); });
    const results = await storageStage('conditional_writes', () => Promise.all([
      store.compareAndSwapJson(path, first.version, { revision: 2 }),
      store.compareAndSwapJson(path, first.version, { revision: 3 }),
    ]));
    const latest = await storageStage('conditional_writes', () => store.readVersionedJson(path));
    checks.conditional_writes = results.filter(Boolean).length === 1
      && latest?.version !== first.version && [2, 3].includes(latest?.value?.revision);
    if (!checks.conditional_writes) await storageStage('conditional_writes', () => { throw new Error('State verification failed.'); });
    const duplicate = await storageStage('create_conflict', () => store.compareAndSwapJson(path, null, { revision: 4 }));
    const afterDuplicate = await storageStage('create_conflict', () => store.readVersionedJson(path));
    checks.create_conflict = duplicate === false && afterDuplicate?.version === latest.version
      && afterDuplicate?.value?.revision === latest.value.revision;
    if (!checks.create_conflict) await storageStage('create_conflict', () => { throw new Error('State verification failed.'); });
  } finally {
    if (created) await storageStage('cleanup', () => store.delete(path));
  }
  checks.cleanup = await storageStage('cleanup_read', () => store.readVersionedJson(path)) === null;
  if (!checks.cleanup) await storageStage('cleanup_read', () => { throw new Error('State verification failed.'); });
  return { verified: true, checks };
}

async function verifyHermesRefresh() {
  const before = await readCredentialRecord();
  if (!before) throw new Error('Refresh verification failed.');

  const refreshed = await getAccessCredential({forceRefresh: true, deadline: Date.now() + 30_000});
  if (!refreshed || typeof refreshed.accessToken !== 'string' || !refreshed.accessToken) {
    throw new Error('Refresh verification failed.');
  }

  const after = await readCredentialRecord();
  const persisted = Boolean(after
    && after.version !== before.version
    && after.value.generation > before.value.generation
    && after.value.generation === after.value.last_refresh_from_generation + 1
    && after.value.refresh_state === null
    && after.value.access_token === refreshed.accessToken
    && after.value.access_token !== before.value.access_token
    && after.value.refresh_token !== before.value.refresh_token);
  if (!persisted) throw new Error('Refresh verification failed.');

  const ticket = await requestCloudJson('/api/auth/ws-ticket', {
    method: 'POST',
    accessToken: refreshed.accessToken,
    timeoutMs: 10_000,
  });
  if (typeof ticket?.ticket !== 'string' || ticket.ticket.length < 20 || ticket.ticket.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(ticket.ticket) || ticket.ttl_seconds !== 30) {
    throw new Error('Refresh verification failed.');
  }

  return {refreshed: true, persisted: true, bearer_verified: true};
}

module.exports = async function nativeBootstrapHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  }
  if (!authenticateOperatorRequest(req)) {
    return sendJson(res, 401, { error: 'Operator authorization required.' });
  }
  let body;
  try { body = await readJson(req, 24 * 1024); }
  catch (error) {
    const status = [408, 413].includes(error.statusCode) ? error.statusCode : 400;
    return sendJson(res, status, { error: 'Invalid initialization request.' });
  }
  if (body?.action === 'store_hermes_credentials' && exactKeys(body, ['action', 'credentials'])) {
    try {
      await persistCredentials(body.credentials);
      return sendJson(res, 201, { stored: true });
    } catch (error) {
      const status = error.statusCode >= 400 && error.statusCode < 500 ? 400 : 503;
      return sendJson(res, status, { error: 'Credential initialization failed.' });
    }
  }
  if (body?.action === 'verify_state_store' && exactKeys(body, ['action'])) {
    try { return sendJson(res, 200, await verifyStateStore()); }
    catch (error) { return sendJson(res, 503, { error: 'Private state verification failed.',
      stage: STORE_PROBE_STAGES.includes(error.probeStage) ? error.probeStage : 'initialization',
      kind: STORE_FAILURE_KINDS.includes(error.probeKind) ? error.probeKind : 'storage_error' }); }
  }
  if (body?.action === 'inspect_hermes_auth' && exactKeys(body, ['action'])) {
    try {
      const record = await readCredentialRecord();
      const refresh = record?.value?.refresh_state;
      const status = refresh === null || refresh === undefined ? 'none'
        : ['refreshing', 'uncertain'].includes(refresh.status) ? refresh.status : 'unknown';
      return sendJson(res, 200, {connected: Boolean(record), refresh: status,
        expired: record ? record.value.expires_at <= Math.floor(Date.now() / 1000) : false,
        weak_version: Boolean(record?.version?.startsWith('W/'))});
    } catch { return sendJson(res, 503, {error: 'Hermes authorization state could not be inspected.'}); }
  }
  if (body?.action === 'verify_hermes_refresh' && exactKeys(body, ['action'])) {
    try { return sendJson(res, 200, await verifyHermesRefresh()); }
    catch { return sendJson(res, 503, {error: 'Hermes credential refresh verification failed.'}); }
  }
  return sendJson(res, 400, { error: 'Invalid initialization request.' });
};
