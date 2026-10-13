'use strict';

const crypto = require('node:crypto');
const { getStateStore } = require('./state-store');

const CREDENTIAL_PATH = 'm2/hermes/credentials';
const DEFAULT_HTTP_TIMEOUT_MS = 15000;
const MIN_HTTP_TIMEOUT_MS = 100;
const MAX_HTTP_TIMEOUT_MS = 120000;
const MAX_HTTP_BODY_BYTES = 1024 * 1024;
const MAX_REDACTION_SCAN_BYTES = 1024 * 1024;
const MAX_TOKEN_LENGTH = 8192;
const REFRESH_SKEW_SECONDS = 30;
const REFRESH_POLL_MS = 150;

class HermesError extends Error {
  constructor(message, statusCode = 502, code = 'hermes_error', upstreamStatus = null) {
    super(message);
    this.name = 'HermesError';
    this.statusCode = statusCode;
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

function timeoutMs() {
  const raw = String(process.env.HERMES_REQUEST_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_HTTP_TIMEOUT_MS;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= MIN_HTTP_TIMEOUT_MS && value <= MAX_HTTP_TIMEOUT_MS
    ? value
    : DEFAULT_HTTP_TIMEOUT_MS;
}

function normalizeCloudOrigin(raw = process.env.HERMES_CLOUD_ORIGIN) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new HermesError('Hermes Cloud is not configured on the server.', 503, 'hermes_cloud_not_configured');
  }
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HermesError('Hermes Cloud origin is invalid.', 503, 'hermes_cloud_not_configured');
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new HermesError('Hermes Cloud origin is invalid.', 503, 'hermes_cloud_not_configured');
  }
  return url.origin;
}

function boundedString(value, field, maxLength, pattern = null) {
  if (typeof value !== 'string' || !value || value.length > maxLength
    || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)
    || (pattern && !pattern.test(value))) {
    throw new HermesError(`Hermes Cloud ${field} is invalid.`, 400, 'hermes_credentials_invalid');
  }
  return value;
}

function normalizeBearerPayload(payload, expectedIdentity = null) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HermesError('Hermes Cloud returned invalid authorization data.', 502, 'hermes_auth_response_invalid');
  }
  const accessToken = boundedString(payload.access_token, 'access token', MAX_TOKEN_LENGTH);
  const refreshToken = boundedString(payload.refresh_token, 'refresh token', MAX_TOKEN_LENGTH);
  if (/\s/.test(accessToken) || /\s/.test(refreshToken)) {
    throw new HermesError('Hermes Cloud authorization data is invalid.', 502, 'hermes_auth_response_invalid');
  }
  const provider = boundedString(payload.provider, 'provider', 80, /^[A-Za-z0-9_.:-]+$/);
  const userId = boundedString(payload.user_id, 'identity', 200, /^[A-Za-z0-9_.:@+-]+$/);
  const expiresAt = payload.expires_at;
  if (payload.token_type !== 'Bearer' || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new HermesError('Hermes Cloud returned invalid authorization data.', 502, 'hermes_auth_response_invalid');
  }
  if (expectedIdentity && (expectedIdentity.provider !== provider || expectedIdentity.user_id !== userId)) {
    throw new HermesError('Hermes Cloud account identity changed; reconnect Hermes Cloud.', 401, 'hermes_reauth_required');
  }
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_at: expiresAt,
    provider,
    user_id: userId,
  };
}

function normalizeCredentialPayload(payload, expectedOrigin = normalizeCloudOrigin()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HermesError('Hermes Cloud credentials are invalid.', 400, 'hermes_credentials_invalid');
  }
  let suppliedOrigin;
  try {
    suppliedOrigin = normalizeCloudOrigin(payload.cloud_origin);
  } catch {
    throw new HermesError('Hermes Cloud credential issuer is invalid.', 400, 'hermes_credentials_invalid');
  }
  if (suppliedOrigin !== expectedOrigin) {
    throw new HermesError('Hermes Cloud credential issuer does not match this deployment.', 400, 'hermes_credentials_invalid');
  }
  return { cloud_origin: suppliedOrigin, ...normalizeBearerPayload(payload) };
}

async function readBoundedText(response, maxBytes = MAX_HTTP_BODY_BYTES) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HermesError('Hermes Cloud response exceeded the size limit.', 502, 'hermes_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

function safeUpstreamCode(body) {
  const value = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '';
}

function errorForResponse(status, code) {
  if (status === 401 && code === 'session_expired') {
    return new HermesError('Hermes Cloud authorization expired; reconnect Hermes Cloud.', 401, 'hermes_reauth_required', status);
  }
  if (status === 401 || status === 403) {
    return new HermesError('Hermes Cloud rejected authorization.', status, 'hermes_cloud_unauthorized', status);
  }
  if (status === 503) {
    return new HermesError('Hermes Cloud is temporarily unavailable.', 503, 'hermes_cloud_unavailable', status);
  }
  return new HermesError('Hermes Cloud request failed.', 502, 'hermes_cloud_request_failed', status);
}

async function requestCloudJson(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new HermesError('Hermes Cloud request path is invalid.', 500, 'invalid_internal_path');
  }
  const origin = normalizeCloudOrigin();
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new HermesError('Hermes Cloud request path is invalid.', 500, 'invalid_internal_path');
  const controller = new AbortController();
  const configuredTimeout = Math.min(MAX_HTTP_TIMEOUT_MS, Math.max(MIN_HTTP_TIMEOUT_MS, options.timeoutMs || timeoutMs()));
  const remaining = Number.isFinite(options.deadline) ? Math.floor(options.deadline - Date.now()) : Infinity;
  if (remaining <= 0) throw new HermesError('Hermes native request exceeded its time budget.', 504, 'hermes_native_send_deadline');
  const timeout = Math.min(configuredTimeout, remaining);
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { accept: 'application/json' };
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  let body;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
    if (Buffer.byteLength(body, 'utf8') > 32 * 1024) {
      clearTimeout(timer);
      throw new HermesError('Hermes Cloud request exceeded the size limit.', 400, 'hermes_request_too_large');
    }
  }
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
      redirect: 'manual',
    });
    const text = await readBoundedText(response, options.maxBodyBytes || MAX_HTTP_BODY_BYTES);
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch {
        throw new HermesError('Hermes Cloud returned malformed JSON.', 502, 'hermes_response_invalid', response.status);
      }
    }
    if (!response.ok) {
      const error = errorForResponse(response.status, safeUpstreamCode(payload));
      error.upstreamCode = safeUpstreamCode(payload);
      throw error;
    }
    return payload;
  } catch (error) {
    if (error instanceof HermesError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new HermesError('Hermes Cloud request timed out.', 504, 'hermes_cloud_timeout');
    }
    throw new HermesError('Could not reach Hermes Cloud.', 502, 'hermes_cloud_unreachable');
  } finally {
    clearTimeout(timer);
  }
}

function validateStoredRecord(value, origin = normalizeCloudOrigin()) {
  if (!value || typeof value !== 'object' || value.schema_version !== 1 || value.issuer !== origin) {
    throw new HermesError('Hermes Cloud credentials require reconnection.', 401, 'hermes_reauth_required');
  }
  const bearer = normalizeBearerPayload(value);
  const generation = Number.isSafeInteger(value.generation) && value.generation > 0 ? value.generation : 1;
  return {
    schema_version: 1,
    issuer: origin,
    ...bearer,
    generation,
    last_refresh_from_generation: Number.isSafeInteger(value.last_refresh_from_generation)
      ? value.last_refresh_from_generation
      : null,
    created_at: Number.isSafeInteger(value.created_at) ? value.created_at : Date.now(),
    updated_at: Number.isSafeInteger(value.updated_at) ? value.updated_at : Date.now(),
    refresh_state: value.refresh_state && typeof value.refresh_state === 'object' ? value.refresh_state : null,
  };
}

async function readCredentialRecord() {
  const origin = normalizeCloudOrigin();
  const stored = await getStateStore().readVersionedJson(CREDENTIAL_PATH);
  if (!stored) return null;
  return { version: stored.version, value: validateStoredRecord(stored.value, origin) };
}

async function persistCredentials(payload) {
  const origin = normalizeCloudOrigin();
  const normalized = normalizeCredentialPayload(payload, origin);
  const store = getStateStore();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const previous = await store.readVersionedJson(CREDENTIAL_PATH);
    const old = previous ? validateStoredRecord(previous.value, origin) : null;
    if (old && (old.provider !== normalized.provider || old.user_id !== normalized.user_id)) {
      throw new HermesError('Hermes Cloud account identity changed; reconnect explicitly.', 409, 'hermes_account_identity_changed');
    }
    const now = Date.now();
    const record = {
      schema_version: 1,
      issuer: origin,
      ...normalized,
      generation: (old?.generation || 0) + 1,
      created_at: old?.created_at || now,
      updated_at: now,
      refresh_state: null,
    };
    if (await store.compareAndSwapJson(CREDENTIAL_PATH, previous?.version ?? null, record)) {
      return { stored: true, provider: record.provider, expires_at: record.expires_at };
    }
  }
  throw new HermesError('Hermes Cloud credentials could not be saved; retry the connection.', 503, 'hermes_state_conflict');
}

function reauthError() {
  return new HermesError('Hermes Cloud authorization needs to be reconnected.', 401, 'hermes_reauth_required');
}

function isFresh(record, nowSeconds = Math.floor(Date.now() / 1000)) {
  return record.expires_at > nowSeconds + REFRESH_SKEW_SECONDS;
}

async function compareCurrent(store, version, next) {
  return store.compareAndSwapJson(CREDENTIAL_PATH, version, next);
}

async function markLeaseState(leaseId, state) {
  const store = getStateStore();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.readVersionedJson(CREDENTIAL_PATH);
    if (!current) return false;
    const record = validateStoredRecord(current.value);
    if (record.refresh_state?.lease_id !== leaseId) return false;
    const next = { ...record, refresh_state: state, updated_at: Date.now() };
    if (await compareCurrent(store, current.version, next)) return true;
  }
  return false;
}

async function markUncertain(leaseId) {
  try {
    await markLeaseState(leaseId, { status: 'uncertain', lease_id: leaseId, since: Date.now() });
  } catch {
    // Keep the CAS lease as a fail-closed marker when state storage itself is unavailable.
  }
}

async function waitForRefreshOrReject(deadline) {
  if (Date.now() >= deadline) {
    throw new HermesError('Hermes Cloud credential refresh is already in progress.', 503, 'hermes_refresh_in_progress');
  }
  await new Promise((resolve) => setTimeout(resolve, Math.min(REFRESH_POLL_MS, Math.max(1, deadline - Date.now()))));
}

async function getAccessCredential(options = {}) {
  const origin = normalizeCloudOrigin();
  const store = getStateStore();
  let forceBaseGeneration = null;
  const waitDeadline = Math.min(
    Date.now() + Math.min(timeoutMs(), options.waitMs || timeoutMs()),
    options.deadline ?? Infinity,
  );
  while (true) {
    if (Date.now() >= waitDeadline) {
      throw new HermesError('Hermes Cloud credential refresh is already in progress.', 503, 'hermes_refresh_in_progress');
    }
    const current = await store.readVersionedJson(CREDENTIAL_PATH);
    if (!current) throw new HermesError('Hermes Cloud is not connected; run the native authorization command.', 401, 'hermes_auth_required');
    const record = validateStoredRecord(current.value, origin);
    if (!record.access_token || !record.refresh_token) throw reauthError();
    if (options.forceRefresh === true && forceBaseGeneration === null) forceBaseGeneration = record.generation;

    const refreshState = record.refresh_state;
    if (refreshState) {
      if (refreshState.status === 'uncertain'
        || !Number.isSafeInteger(refreshState.lease_until) || refreshState.lease_until <= Date.now()) {
        if (refreshState.lease_id) {
          try {
            await markLeaseState(refreshState.lease_id, {
              status: 'uncertain', lease_id: refreshState.lease_id, since: Date.now(),
            });
          } catch {
            // The pre-existing lease remains fail-closed if the store is unavailable.
          }
        }
        throw reauthError();
      }
      await waitForRefreshOrReject(waitDeadline);
      continue;
    }

    if (options.forceRefresh === true && record.generation > forceBaseGeneration
      && record.last_refresh_from_generation === forceBaseGeneration && isFresh(record)) {
      return {
        accessToken: record.access_token,
        redactionSecrets: [record.access_token, record.refresh_token],
        provider: record.provider,
        userId: record.user_id,
        expiresAt: record.expires_at,
      };
    }

    if (isFresh(record) && options.forceRefresh !== true) {
      return {
        accessToken: record.access_token,
        redactionSecrets: [record.access_token, record.refresh_token],
        provider: record.provider,
        userId: record.user_id,
        expiresAt: record.expires_at,
      };
    }

    const leaseId = crypto.randomUUID();
    const now = Date.now();
    const leaseDuration = timeoutMs() + 5000;
    const claimed = {
      ...record,
      refresh_state: { status: 'refreshing', lease_id: leaseId, started_at: now, lease_until: now + leaseDuration },
      updated_at: now,
    };
    if (!(await compareCurrent(store, current.version, claimed))) continue;

    const lease = await store.readVersionedJson(CREDENTIAL_PATH);
    if (!lease || lease.value?.refresh_state?.lease_id !== leaseId) continue;
    const leaseVersion = lease.version;
    try {
      const payload = await requestCloudJson('/auth/native/refresh', {
        method: 'POST',
        body: { refresh_token: record.refresh_token, provider: record.provider },
        timeoutMs: timeoutMs(),
        deadline: options.deadline,
      });
      const refreshed = normalizeBearerPayload(payload, record);
      const latest = await store.readVersionedJson(CREDENTIAL_PATH);
      if (!latest || latest.value?.refresh_state?.lease_id !== leaseId) {
        const winner = latest ? validateStoredRecord(latest.value, origin) : null;
        if (winner && winner.generation > record.generation && !winner.refresh_state
          && winner.provider === record.provider && winner.user_id === record.user_id && isFresh(winner)) {
          return { accessToken: winner.access_token, redactionSecrets: [winner.access_token, winner.refresh_token], provider: winner.provider, userId: winner.user_id, expiresAt: winner.expires_at };
        }
        await markUncertain(leaseId);
        throw reauthError();
      }
      const next = {
        schema_version: 1,
        issuer: origin,
        ...refreshed,
        generation: record.generation + 1,
        last_refresh_from_generation: record.generation,
        created_at: record.created_at,
        updated_at: Date.now(),
        refresh_state: null,
      };
      if (!(await compareCurrent(store, latest.version, next))) {
        const winnerVersioned = await store.readVersionedJson(CREDENTIAL_PATH);
        const winner = winnerVersioned ? validateStoredRecord(winnerVersioned.value, origin) : null;
        if (winner && winner.generation > record.generation && !winner.refresh_state
          && winner.provider === record.provider && winner.user_id === record.user_id && isFresh(winner)) {
          return { accessToken: winner.access_token, redactionSecrets: [winner.access_token, winner.refresh_token], provider: winner.provider, userId: winner.user_id, expiresAt: winner.expires_at };
        }
        await markUncertain(leaseId);
        throw reauthError();
      }
      return { accessToken: refreshed.access_token, redactionSecrets: [refreshed.access_token, refreshed.refresh_token], provider: refreshed.provider, userId: refreshed.user_id, expiresAt: refreshed.expires_at };
    } catch (error) {
      if (error?.upstreamStatus === 401 && error.upstreamCode === 'session_expired') {
        await markUncertain(leaseId);
        throw reauthError();
      }
      if (error?.code === 'hermes_reauth_required') throw error;
      await markUncertain(leaseId);
      throw reauthError();
    }
  }
}

async function getCredentialMetadata() {
  try {
    const record = await readCredentialRecord();
    if (!record) return { configured: false, authenticated: false, provider: null, expires_at: null };
    return {
      configured: true,
      authenticated: !record.value.refresh_state && isFresh(record.value),
      provider: record.value.provider,
      expires_at: record.value.expires_at,
    };
  } catch {
    return { configured: false, authenticated: false, provider: null, expires_at: null };
  }
}

async function redactCredentialText(value, limit = 12000, privateSecrets = []) {
  let text = String(value ?? '').slice(0, MAX_REDACTION_SCAN_BYTES);
  try {
    const record = await readCredentialRecord();
    if (record) {
      for (const token of [record.value.access_token, record.value.refresh_token]) {
        if (token) text = text.split(token).join('[REDACTED]');
      }
    }
  } catch {
    throw new HermesError('Hermes output could not be safely inspected.', 503, 'hermes_output_unavailable');
  }
  if (Array.isArray(privateSecrets)) {
    for (const token of privateSecrets) {
      if (typeof token === 'string' && token.length >= 16 && token.length <= MAX_TOKEN_LENGTH) {
        text = text.split(token).join('[REDACTED]');
      }
    }
  }
  for (const key of ['M2_OPERATOR_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'HERMES_API_KEY']) {
    const secret = process.env[key];
    if (typeof secret === 'string' && secret.length >= 16) text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/\bBearer\s+[^\s,;"'<>]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b(?:access|refresh)[\s_-]*token\s*[:=]\s*["']?[^\s,;"'<>]+/gi, '[REDACTED_TOKEN]')
    .replace(/\b(?:api[_-]?key|secret|credential)\s*[:=]\s*["']?[^\s,;"'<>]{8,}/gi, '[REDACTED_SECRET]')
    .replace(/\b(?:API_SERVER_KEY|API_KEY|API_SECRET|[A-Z][A-Z0-9_]*(?:_API_KEY|_KEY|_ACCESS_TOKEN|_REFRESH_TOKEN|_TOKEN|_CLIENT_SECRET|_OPERATOR_TOKEN|_READ_WRITE_TOKEN|_AUTH_SECRET|_SECRET|_PASSWORD|_CREDENTIALS|_DATABASE_URL))\b["']?\s*[:=]\s*["']?[^\s,;"'<>]+/gi, '[REDACTED_SECRET]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_TOKEN]')
    .slice(0, limit);
}

module.exports = {
  CREDENTIAL_PATH,
  HermesError,
  getAccessCredential,
  getCredentialMetadata,
  normalizeBearerPayload,
  normalizeCloudOrigin,
  normalizeCredentialPayload,
  persistCredentials,
  readCredentialRecord,
  redactCredentialText,
  requestCloudJson,
};
