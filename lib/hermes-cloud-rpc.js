'use strict';

const crypto = require('node:crypto');
const WebSocket = require('ws');
const { getStateStore } = require('./state-store');
const {
  HermesError,
  getAccessCredential,
  normalizeCloudOrigin,
  redactCredentialText,
  requestCloudJson,
} = require('./hermes-cloud-auth');

const WS_PROTOCOL = 'hermes-gateway-v1';
const WS_TICKET_PREFIX = 'hermes-gateway-ticket.';
const WS_TICKET_TTL_SECONDS = 30;
const MAX_WS_FRAME_BYTES = 1024 * 1024;
const MAX_RPC_REQUEST_BYTES = 32 * 1024;
const CONTROL_TIMEOUT_MS = 15000;
const NATIVE_SEND_BUDGET_MS = 120000;
const GUARD_CLEANUP_RESERVE_MS = 20000;
const DEFAULT_TURN_TIMEOUT_MS = 90000;
const MAX_TURN_TIMEOUT_MS = 90000;
const MAX_SESSION_ID_LENGTH = 200;
const MAX_TASK_BYTES = 12 * 1024;
const MAX_ASSISTANT_TEXT = 12000;
const MAX_NATIVE_EXPORT_BYTES = 4 * 1024 * 1024;
const MAX_INSPECTED_ASSISTANT_TEXT = 4000;
const MAX_CREDENTIAL_FINGERPRINTS = 32;
const MIN_CREDENTIAL_FINGERPRINT_LENGTH = 16;
const MAX_CREDENTIAL_FINGERPRINT_LENGTH = 8192;
const REQUEST_GUARD_PREFIX = 'm2/hermes/requests/';
const REQUEST_RECORD_PREFIX = 'm2/hermes/byid/';

function turnTimeoutMs() {
  const raw = String(process.env.HERMES_TURN_TIMEOUT_MS || '').trim();
  if (!raw) return DEFAULT_TURN_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) throw new HermesError('Hermes turn timeout must be an integer no greater than 90 seconds.', 500, 'hermes_turn_timeout_invalid');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1000 || value > MAX_TURN_TIMEOUT_MS) {
    throw new HermesError('Hermes turn timeout must be between 1 and 90 seconds.', 500, 'hermes_turn_timeout_invalid');
  }
  return value;
}

function deadlineError() {
  return new HermesError('Hermes native request exceeded its time budget; inspect the session before retrying.', 504, 'hermes_native_send_deadline');
}

function stageTimeoutMs(preferred, deadline) {
  if (!Number.isFinite(deadline)) return preferred;
  const remaining = Math.floor(deadline - Date.now());
  if (remaining <= 0) throw deadlineError();
  return Math.max(1, Math.min(preferred, remaining));
}

function withinDeadline(operation, deadline) {
  if (!Number.isFinite(deadline)) return Promise.resolve().then(operation);
  const remaining = Math.floor(deadline - Date.now());
  if (remaining <= 0) return Promise.reject(deadlineError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(deadlineError()), remaining);
    Promise.resolve().then(operation).then(
      (value) => {
        clearTimeout(timer);
        if (Date.now() >= deadline) reject(deadlineError());
        else resolve(value);
      },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > MAX_SESSION_ID_LENGTH
    || sessionId.trim() !== sessionId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(sessionId)) {
    throw new HermesError('Hermes session identifier is invalid.', 400, 'hermes_session_id_invalid');
  }
  return sessionId;
}

function sanitizeTitle(value) {
  if (value === undefined || value === null || value === '') return 'M2 Hermes session';
  if (typeof value !== 'string') throw new HermesError('Hermes session title is invalid.', 400, 'hermes_title_invalid');
  const title = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || Buffer.byteLength(title, 'utf8') > 120) {
    throw new HermesError('Hermes session title is invalid.', 400, 'hermes_title_invalid');
  }
  return title;
}

function validateTask(task) {
  if (typeof task !== 'string') throw new HermesError('Hermes task must be text.', 400, 'hermes_task_invalid');
  const normalized = task.trim();
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > MAX_TASK_BYTES) {
    throw new HermesError('Hermes task is empty or exceeds the size limit.', 400, 'hermes_task_invalid');
  }
  if (isCredentialProbe(normalized)) {
    throw new HermesError('Hermes cannot be asked to reveal credentials or private runtime state.', 400, 'hermes_private_state_request_refused');
  }
  return normalized;
}

function safeName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= 120 && /^[A-Za-z0-9_.:-]+$/.test(name) ? name : null;
}

function safeBoundedText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function credentialFingerprints(secrets = []) {
  const fingerprints = new Map();
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < MIN_CREDENTIAL_FINGERPRINT_LENGTH
      || secret.length > MAX_CREDENTIAL_FINGERPRINT_LENGTH) continue;
    const sha256 = crypto.createHash('sha256').update(secret).digest('hex');
    fingerprints.set(`${secret.length}:${sha256}`, { length: secret.length, sha256 });
  }
  return [...fingerprints.values()];
}

function mergeCredentialFingerprints(...groups) {
  const unique = new Map();
  for (const group of groups) {
    if (group === null || group === undefined) continue;
    if (!Array.isArray(group)) {
      throw new HermesError('Hermes output cannot be safely inspected with the available credential metadata.', 503, 'hermes_output_unavailable');
    }
    for (const item of group) {
      if (!item || !Number.isSafeInteger(item.length) || item.length < MIN_CREDENTIAL_FINGERPRINT_LENGTH
        || item.length > MAX_CREDENTIAL_FINGERPRINT_LENGTH || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) {
        throw new HermesError('Hermes output cannot be safely inspected with the available credential metadata.', 503, 'hermes_output_unavailable');
      }
      unique.set(`${item.length}:${item.sha256}`, { length: item.length, sha256: item.sha256 });
    }
  }
  if (unique.size > MAX_CREDENTIAL_FINGERPRINTS) {
    throw new HermesError('Hermes output cannot be safely inspected with the available credential metadata.', 503, 'hermes_output_unavailable');
  }
  return [...unique.values()];
}

function redactFingerprintedSecrets(value, fingerprints, deadline = Infinity) {
  if (typeof value !== 'string' || !Array.isArray(fingerprints) || !fingerprints.length) return value;
  const matches = [];
  for (const item of fingerprints) {
    if (!Number.isSafeInteger(item?.length) || item.length < MIN_CREDENTIAL_FINGERPRINT_LENGTH
      || item.length > MAX_CREDENTIAL_FINGERPRINT_LENGTH || !/^[a-f0-9]{64}$/.test(item.sha256 || '')
      || item.length > value.length) continue;
    for (let start = 0; start <= value.length - item.length; start += 1) {
      if ((start & 127) === 0 && Date.now() >= deadline) throw deadlineError();
      const hash = crypto.createHash('sha256').update(value.slice(start, start + item.length)).digest('hex');
      if (hash === item.sha256) matches.push([start, start + item.length]);
    }
  }
  if (!matches.length) return value;
  matches.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let output = '';
  let cursor = 0;
  for (const [start, end] of matches) {
    if (start < cursor) continue;
    output += value.slice(cursor, start) + '[REDACTED]';
    cursor = end;
  }
  return output + value.slice(cursor);
}

async function safeOutputText(value, max, redaction = {}) {
  if (typeof value !== 'string') return null;
  const fingerprints = mergeCredentialFingerprints(redaction.fingerprints || []);
  const maxFingerprintLength = fingerprints.reduce((maxLength, item) => Math.max(maxLength, item.length), 0);
  const scanLimit = Math.min(1024 * 1024, max + maxFingerprintLength);
  let text = await redactCredentialText(value, scanLimit, redaction.secrets || []);
  text = redactFingerprintedSecrets(text, fingerprints, redaction.deadline ?? Infinity);
  return safeBoundedText(text.slice(0, max), max);
}

async function safeToolNames(values, deadline = Infinity, redaction = {}) {
  const names = Array.isArray(values) ? values.slice(0, 20).map(safeName).filter(Boolean) : [];
  if (!names.length) return [];
  const redacted = await withinDeadline(
    () => safeOutputText(names.join('\n'), names.length * 120 + names.length - 1, { ...redaction, deadline }),
    deadline,
  );
  return redacted.split('\n').slice(0, 20).map(safeName).filter(Boolean);
}

async function assertSafeSessionId(value) {
  const safe = validateSessionId(value);
  if (await redactCredentialText(safe, MAX_SESSION_ID_LENGTH) !== safe) {
    throw new HermesError('Hermes session identifier is invalid.', 502, 'hermes_session_id_invalid');
  }
  return safe;
}

function responseSessionId(result, key) {
  const value = result && result[key];
  return validateSessionId(value);
}

function responseCanonicalSessionId(result) {
  const fields = ['stored_session_id', 'session_key', 'resumed'];
  const present = fields.filter((field) => result && Object.hasOwn(result, field));
  if (!present.length) return validateSessionId(undefined);

  const values = present.map((field) => responseSessionId(result, field));
  if (values.some((value) => value !== values[0])) {
    throw new HermesError('Hermes returned conflicting session identities.', 502, 'hermes_session_identity_mismatch');
  }
  return values[0];
}

function safeRpcError(error) {
  const code = Number.isSafeInteger(error?.code) ? error.code : null;
  if (code === 4009 || code === 4091) {
    return new HermesError('Hermes session is busy; inspect its current state before sending another task.', 409, 'hermes_session_busy', 409);
  }
  if (code === 4007) return new HermesError('Hermes session was not found.', 404, 'hermes_session_not_found', 404);
  if (code === -32602 || code === 4006 || code === 4021) {
    return new HermesError('Hermes rejected the native session request.', 400, 'hermes_rpc_invalid_request', 400);
  }
  const safe = new HermesError('Hermes native session request failed.', 502, 'hermes_rpc_failed');
  safe.rpcCode = code;
  return safe;
}

class HermesRpcClient {
  constructor(ws, deadline = null) {
    this.ws = ws;
    this.deadline = deadline;
    this.pending = new Map();
    this.events = new Set();
    this.nextId = 1;
    this.closed = false;
    this.ready = false;
    this.closeError = null;
    ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    ws.on('close', () => this.onClose());
    ws.on('error', () => this.onClose());
  }

  onMessage(data, isBinary) {
    if (isBinary) {
      this.failAll(new HermesError('Hermes Cloud sent an unsupported frame.', 502, 'hermes_frame_invalid'));
      this.ws.close(1003);
      return;
    }
    const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    if (Buffer.byteLength(text, 'utf8') > MAX_WS_FRAME_BYTES) {
      this.failAll(new HermesError('Hermes Cloud response exceeded the frame size limit.', 502, 'hermes_frame_too_large'));
      this.ws.close(1009);
      return;
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      let frame;
      try { frame = JSON.parse(line); } catch {
        this.failAll(new HermesError('Hermes Cloud sent an invalid JSON-RPC frame.', 502, 'hermes_frame_invalid'));
        this.ws.close(1007);
        return;
      }
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) continue;
      if (frame.method === 'event' && frame.params && typeof frame.params === 'object') {
        if (frame.params.type === 'gateway.ready') this.ready = true;
        for (const listener of this.events) {
          try { listener(frame.params); } catch { /* Event observers cannot break the RPC transport. */ }
        }
        continue;
      }
      const pending = this.pending.get(String(frame.id));
      if (!pending) continue;
      this.pending.delete(String(frame.id));
      clearTimeout(pending.timer);
      if (this.deadline && Date.now() >= this.deadline) {
        const error = deadlineError();
        error.ambiguous = true;
        pending.reject(error);
        continue;
      }
      if (frame.error) {
        const error = safeRpcError(frame.error);
        error.remote = true;
        pending.reject(error);
      } else if (frame.jsonrpc !== '2.0' || !Object.prototype.hasOwnProperty.call(frame, 'result')) {
        pending.reject(new HermesError('Hermes Cloud returned an invalid JSON-RPC response.', 502, 'hermes_rpc_response_invalid'));
      } else {
        pending.resolve(frame.result);
      }
    }
  }

  onClose() {
    if (this.closed) return;
    this.closed = true;
    const error = new HermesError('Hermes Cloud WebSocket disconnected.', 502, 'hermes_ws_disconnected');
    this.closeError = error;
    this.failAll(error);
  }

  failAll(error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  onEvent(listener) {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }

  async waitReady(timeoutMs = CONTROL_TIMEOUT_MS) {
    if (this.ready) return;
    const deadline = Math.min(Date.now() + timeoutMs, this.deadline ?? Infinity);
    while (!this.ready && !this.closed && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(20, Math.max(1, deadline - Date.now()))));
    }
    if (!this.ready) throw this.closeError || (this.deadline && Date.now() >= this.deadline
      ? deadlineError()
      : new HermesError('Hermes Cloud did not initialize the native session.', 504, 'hermes_ws_ready_timeout'));
  }

  request(method, params = {}, timeoutMs = CONTROL_TIMEOUT_MS) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(this.closeError || new HermesError('Hermes Cloud WebSocket is not connected.', 502, 'hermes_ws_disconnected'));
    }
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    if (Buffer.byteLength(body, 'utf8') > MAX_RPC_REQUEST_BYTES) {
      return Promise.reject(new HermesError('Hermes native session request exceeded the size limit.', 400, 'hermes_request_too_large'));
    }
    let effectiveTimeout;
    try { effectiveTimeout = stageTimeoutMs(timeoutMs, this.deadline); }
    catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        const error = this.deadline && Date.now() >= this.deadline
          ? deadlineError()
          : new HermesError('Hermes native session request timed out.', 504, 'hermes_rpc_timeout');
        error.ambiguous = true;
        reject(error);
      }, effectiveTimeout);
      this.pending.set(String(id), { resolve, reject, timer });
      this.ws.send(`${body}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(String(id));
        if (!pending) return;
        this.pending.delete(String(id));
        clearTimeout(pending.timer);
        const sendError = new HermesError('Hermes Cloud WebSocket send failed.', 502, 'hermes_ws_send_failed');
        sendError.ambiguous = true;
        pending.reject(sendError);
      });
    });
  }

  async close(maxWaitMs = 300) {
    this.events.clear();
    if (this.closed || this.ws.readyState === WebSocket.CLOSED) return;
    if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) {
      this.ws.terminate();
      this.closed = true;
      this.failAll(new HermesError('Hermes Cloud WebSocket closed.', 502, 'hermes_ws_disconnected'));
      return;
    }
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, Math.min(300, maxWaitMs));
      this.ws.once('close', () => { clearTimeout(timer); resolve(); });
      try { this.ws.close(1000); } catch { clearTimeout(timer); resolve(); }
    });
    this.closed = true;
    this.failAll(new HermesError('Hermes Cloud WebSocket closed.', 502, 'hermes_ws_disconnected'));
  }
}

async function openHermesRpc(options = {}) {
  const origin = normalizeCloudOrigin();
  const deadline = options.deadline ?? null;
  const credential = await getAccessCredential({ deadline });
  const ticketPayload = await requestCloudJson('/api/auth/ws-ticket', {
    method: 'POST',
    accessToken: credential.accessToken,
    timeoutMs: CONTROL_TIMEOUT_MS,
    deadline,
  });
  const ticket = ticketPayload && ticketPayload.ticket;
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 256
    || !/^[A-Za-z0-9_-]+$/.test(ticket)
    || ticketPayload.ttl_seconds !== WS_TICKET_TTL_SECONDS) {
    throw new HermesError('Hermes Cloud returned an invalid WebSocket ticket.', 502, 'hermes_ws_ticket_invalid');
  }
  const url = new URL('/api/ws', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const handshakeTimeout = stageTimeoutMs(CONTROL_TIMEOUT_MS, deadline);
  let ws;
  let client;
  try {
    ws = new WebSocket(url.href, [WS_PROTOCOL, `${WS_TICKET_PREFIX}${ticket}`], {
    handshakeTimeout,
    maxPayload: MAX_WS_FRAME_BYTES,
    perMessageDeflate: false,
    rejectUnauthorized: true,
  });
    client = new HermesRpcClient(ws, deadline);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new HermesError('Hermes Cloud WebSocket handshake timed out.', 504, 'hermes_ws_handshake_timeout')), handshakeTimeout);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', () => { clearTimeout(timer); reject(new HermesError('Could not connect to Hermes Cloud WebSocket.', 502, 'hermes_ws_connect_failed')); });
    });
    if (ws.protocol !== WS_PROTOCOL) {
      throw new HermesError('Hermes Cloud negotiated an unexpected WebSocket protocol.', 502, 'hermes_ws_protocol_invalid');
    }
    await client.waitReady(CONTROL_TIMEOUT_MS);
    return { client, credential: { ...credential, redactionSecrets: [...(credential.redactionSecrets || []), ticket] } };
  } catch (error) {
    if (client) await client.close(deadline ? Math.max(0, deadline - Date.now()) : 300);
    else ws?.terminate();
    throw error;
  }
}

function requestGuardPath(sessionId) {
  const digest = crypto.createHash('sha256').update(sessionId).digest('hex');
  return `${REQUEST_GUARD_PREFIX}${digest}`;
}

function requestRecordPath(sessionId, requestId) {
  const digest = crypto.createHash('sha256').update(`${sessionId}\0${requestId}`).digest('hex');
  return `${REQUEST_RECORD_PREFIX}${digest}`;
}

function taskDigest(task) {
  return crypto.createHash('sha256').update(task).digest('hex');
}

function activeGuard(record) {
  return record && ['submitting', 'pending', 'uncertain', 'submitted', 'running', 'timed_out'].includes(record.status);
}

async function claimRequestGuard(sessionId, requestId, digest) {
  const store = getStateStore();
  const path = requestGuardPath(sessionId);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await store.readVersionedJson(path);
    if (current && activeGuard(current.value)) {
      if (current.value.request_id === requestId && current.value.task_digest === digest) {
      return { path, requestId, task_digest: digest, recordPath: requestRecordPath(sessionId, requestId), existing: current.value };
      }
      throw new HermesError('A Hermes task is already active or has an uncertain outcome for this session.', 409, 'hermes_session_busy');
    }
    const now = Date.now();
    const next = {
      schema_version: 1,
      status: 'submitting',
      request_id: requestId,
      task_digest: digest,
      record_path: requestRecordPath(sessionId, requestId),
      user_row_id: null,
      event_epoch: null,
      last_seen_seq: 0,
      credential_fingerprints: current?.value?.credential_fingerprints || [],
      created_at: now,
      updated_at: now,
    };
    if (await store.compareAndSwapJson(path, current?.version ?? null, next)) {
      return { path, requestId, task_digest: digest, recordPath: requestRecordPath(sessionId, requestId), previous: current?.value || null };
    }
  }
  throw new HermesError('Hermes session request state could not be reserved.', 503, 'hermes_state_conflict');
}

async function readRequestRecord(sessionId, requestId, digest) {
  const store = getStateStore();
  const path = requestRecordPath(sessionId, requestId);
  const current = await store.readVersionedJson(path);
  if (current && current.value?.task_digest !== digest) {
    throw new HermesError('Hermes request identifier was already used for a different task.', 409, 'hermes_request_id_conflict');
  }
  return { path, record: current?.value || null, version: current?.version ?? null };
}

async function writeRequestRecord(path, expectedVersion, value) {
  const store = getStateStore();
  if (!await store.compareAndSwapJson(path, expectedVersion, value)) {
    throw new HermesError('Hermes request state changed concurrently.', 409, 'hermes_request_in_progress');
  }
}

async function updateRequestRecord(claim, update) {
  const store = getStateStore();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await store.readVersionedJson(claim.recordPath);
    if (!current || current.value?.request_id !== claim.requestId || current.value?.task_digest !== claim.task_digest) {
      throw new HermesError('Hermes request state changed unexpectedly.', 503, 'hermes_state_conflict');
    }
    const next = { ...current.value, ...update, updated_at: Date.now() };
    if (await store.compareAndSwapJson(claim.recordPath, current.version, next)) return next;
  }
  throw new HermesError('Hermes request state could not be saved.', 503, 'hermes_state_conflict');
}

async function updateRequestGuard(claim, update) {
  const store = getStateStore();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await store.readVersionedJson(claim.path);
    if (!current || current.value?.request_id !== claim.requestId) {
      throw new HermesError('Hermes session request state changed unexpectedly.', 503, 'hermes_state_conflict');
    }
    const next = { ...current.value, ...update, updated_at: Date.now() };
    if (await store.compareAndSwapJson(claim.path, current.version, next)) return next;
  }
  throw new HermesError('Hermes session request state could not be saved.', 503, 'hermes_state_conflict');
}

async function restoreRequestGuard(claim) {
  try {
    await updateRequestGuard(claim, claim.previous || {
      schema_version: 1, status: 'idle', request_id: null, user_row_id: null,
      event_epoch: null, last_seen_seq: 0, created_at: Date.now(),
    });
  } catch { /* Keep a stale active guard rather than risk duplicate execution. */ }
}

function readTurnTimeout() {
  return turnTimeoutMs();
}

function eventParts(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const type = typeof frame.type === 'string' ? frame.type : '';
  const sessionId = typeof frame.session_id === 'string' ? frame.session_id : '';
  const seq = Number.isSafeInteger(frame.seq) ? frame.seq : 0;
  const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : {};
  const userRowId = Number.isSafeInteger(payload.persisted_turn?.user_row_id) ? payload.persisted_turn.user_row_id : null;
  const finalAssistantRowId = Number.isSafeInteger(payload.persisted_turn?.final_assistant_row_id) ? payload.persisted_turn.final_assistant_row_id : null;
  const status = ['complete', 'error', 'interrupted'].includes(payload.status) ? payload.status : null;
  return { type, sessionId, seq, userRowId, finalAssistantRowId, status };
}

function requestStatusFromTerminal(status) {
  if (status === 'complete') return 'completed';
  if (status === 'error') return 'failed';
  if (status === 'interrupted') return 'interrupted';
  return null;
}

function parseNativeToolCalls(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  return value.map((call) => {
    const id = typeof call?.id === 'string' ? call.id : '';
    const name = safeName(call?.function?.name || call?.name);
    if (!id || !name) return null;
    return { id, type: 'function', function: { name, arguments: '' } };
  });
}

function normalizeNativeExport(payload, storedId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.id !== storedId || !Array.isArray(payload.messages)) {
    throw new HermesError('Hermes returned invalid persisted session history.', 502, 'hermes_history_invalid');
  }
  let previousId = 0;
  const seen = new Set();
  const messages = payload.messages.map((row) => {
    if (!row || typeof row !== 'object' || row.session_id !== storedId
      || !Number.isSafeInteger(row.id) || row.id <= previousId || seen.has(row.id)
      || !['user', 'assistant', 'tool'].includes(row.role)) {
      throw new HermesError('Hermes returned invalid persisted session history.', 502, 'hermes_history_invalid');
    }
    const calls = row.role === 'assistant' ? parseNativeToolCalls(row.tool_calls) : [];
    if (!calls || calls.some((call) => !call)) {
      throw new HermesError('Hermes returned invalid persisted session history.', 502, 'hermes_history_invalid');
    }
    const nullToolCallContent = row.role === 'assistant' && row.content == null && calls.length > 0;
    if (!nullToolCallContent && typeof row.content !== 'string') {
      throw new HermesError('Hermes returned invalid persisted session history.', 502, 'hermes_history_invalid');
    }
    previousId = row.id;
    seen.add(row.id);
    return {
      role: row.role,
      row_id: row.id,
      text: row.role === 'tool' || nullToolCallContent ? '' : row.content,
      ...(row.role === 'assistant' ? { tool_calls: calls, finish_reason: row.finish_reason ?? null } : {}),
      ...(row.role === 'tool' ? {
        tool_call_id: typeof row.tool_call_id === 'string' ? row.tool_call_id : '',
        name: typeof row.tool_name === 'string' ? row.tool_name : 'tool',
      } : {}),
      display_kind: typeof row.display_kind === 'string' ? row.display_kind : null,
    };
  });
  return messages;
}

async function getPersistedHistory(credential, storedId, deadline = Infinity) {
  const payload = await withinDeadline(() => requestCloudJson(
    `/api/sessions/${encodeURIComponent(storedId)}/export`,
    {
      accessToken: credential.accessToken,
      timeoutMs: stageTimeoutMs(CONTROL_TIMEOUT_MS, deadline),
      deadline,
      maxBodyBytes: MAX_NATIVE_EXPORT_BYTES,
    },
  ), deadline);
  return normalizeNativeExport(payload, storedId);
}

async function getRpcHistory(client, runtimeId, deadline = Infinity) {
  const result = await withinDeadline(
    () => client.request('session.history', { session_id: runtimeId }, stageTimeoutMs(CONTROL_TIMEOUT_MS, deadline)),
    deadline,
  );
  if (!result || !Array.isArray(result.messages) || !Number.isSafeInteger(result.count) || result.count < 0) {
    throw new HermesError('Hermes returned invalid session history.', 502, 'hermes_history_invalid');
  }
  return result.messages;
}

function hasDurableTerminalReceipt(messages, storedId, requestRecord) {
  if (!requestRecord || !storedId
    || !Number.isSafeInteger(requestRecord.user_row_id)
    || !Number.isSafeInteger(requestRecord.final_assistant_row_id)
    || !/^[a-f0-9]{64}$/.test(requestRecord.task_digest || '')) return false;
  const start = messages.findIndex((row) => row.role === 'user' && row.row_id === requestRecord.user_row_id);
  if (start < 0 || taskDigest(messages[start].text) !== requestRecord.task_digest) return false;
  let end = messages.length;
  for (let i = start + 1; i < messages.length; i += 1) {
    if (messages[i].role === 'user') { end = i; break; }
  }
  const finalIndex = messages.findIndex((row, index) => index > start && row.row_id === requestRecord.final_assistant_row_id);
  if (finalIndex < 0 || finalIndex !== end - 1) return false;
  const final = messages[finalIndex];
  if (final.role !== 'assistant' || final.finish_reason !== 'stop' || !final.text.trim()
    || final.tool_calls.length || /fail|interrupt|error/i.test(final.display_kind || '')) return false;
  const calls = new Map();
  const results = [];
  let normalFinalCount = 0;
  for (let i = start; i < end; i += 1) {
    const row = messages[i];
    if (/fail|interrupt|error/i.test(row.display_kind || '')) return false;
    if (row.role === 'assistant') {
      if (/fail|interrupt|error|length/i.test(row.finish_reason || '')) return false;
      if (row.finish_reason === 'stop') normalFinalCount += 1;
      for (const call of row.tool_calls) {
        if (calls.has(call.id)) return false;
        calls.set(call.id, call.function.name);
      }
    } else if (row.role === 'tool') {
      if (!row.tool_call_id || !calls.has(row.tool_call_id) || calls.get(row.tool_call_id) !== row.name) return false;
      results.push(row.tool_call_id);
    }
  }
  return normalFinalCount === 1 && calls.size === results.length && results.every((id, index) => calls.has(id)
    && results.indexOf(id) === index);
}

function discoverDurableFinalRow(messages, storedId, requestRecord) {
  if (!requestRecord || !Number.isSafeInteger(requestRecord.user_row_id)
    || !/^[a-f0-9]{64}$/.test(requestRecord.task_digest || '')) return null;
  const start = messages.findIndex((row) => row.role === 'user' && row.row_id === requestRecord.user_row_id);
  if (start < 0 || taskDigest(messages[start].text) !== requestRecord.task_digest) return null;
  let end = messages.length;
  for (let i = start + 1; i < messages.length; i += 1) {
    if (messages[i].role === 'user') { end = i; break; }
  }
  if (end <= start + 1) return null;
  const final = messages[end - 1];
  if (final.role !== 'assistant') return null;
  const candidate = { ...requestRecord, final_assistant_row_id: final.row_id };
  return hasDurableTerminalReceipt(messages, storedId, candidate) ? final.row_id : null;
}

function assistantTextForTurn(messages, userRowId) {
  if (!Array.isArray(messages)) return null;
  const start = messages.findIndex((message) => message && message.role === 'user' && message.row_id === userRowId);
  if (start < 0) return null;
  let latest = null;
  for (let i = start + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'user') break;
    if (message.role === 'assistant' && Number.isSafeInteger(message.row_id)) {
      const text = safeBoundedText(message.text, MAX_ASSISTANT_TEXT);
      if (text) latest = text;
    }
  }
  return latest;
}

function toolCallsForMessage(message, calls) {
  if (!Array.isArray(message?.tool_calls)) return;
  for (const call of message.tool_calls) {
    if (!call || typeof call !== 'object') continue;
    const id = typeof call.id === 'string' ? call.id : call.tool_call_id;
    const name = safeName(call.function?.name || call.name);
    if (typeof id === 'string' && id.trim() && name) calls.set(id, name);
  }
}

function toolResultsForMessages(messages, startIndex = 0, stopAtNextUser = true) {
  const names = new Set();
  const assistantCalls = new Map();
  const usedCallIds = new Set();
  let count = 0;
  for (let i = startIndex; Array.isArray(messages) && i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role === 'user') {
      if (stopAtNextUser && i > startIndex) break;
      assistantCalls.clear();
      usedCallIds.clear();
      continue;
    }
    if (message?.role === 'assistant') {
      toolCallsForMessage(message, assistantCalls);
      continue;
    }
    if (message?.role !== 'tool' || typeof message.tool_call_id !== 'string' || !message.tool_call_id.trim()) continue;
    const callName = assistantCalls.get(message.tool_call_id);
    if (!callName || usedCallIds.has(message.tool_call_id)) continue;
    const name = callName;
    if (!name || name === 'tool') continue;
    usedCallIds.add(message.tool_call_id);
    names.add(name);
    count += 1;
  }
  return { count, names: [...names].sort() };
}

function turnMessages(messages, userRowId, finalAssistantRowId = null) {
  if (!Array.isArray(messages)) return null;
  const start = messages.findIndex((message) => message && message.role === 'user' && message.row_id === userRowId);
  if (start < 0) return null;
  let assistant = null;
  let assistantTruncated = false;
  for (let i = start + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'user') break;
    if (message.role === 'assistant' && Number.isSafeInteger(message.row_id)
      && (!Number.isSafeInteger(finalAssistantRowId) || message.row_id === finalAssistantRowId)) {
      if (typeof message.text === 'string') {
        const text = message.text.slice(0, 1024 * 1024);
        if (text) {
          assistant = text;
          assistantTruncated = message.text.length > MAX_ASSISTANT_TEXT;
        }
      }
    }
  }
  return { assistant, assistantRowId: Number.isSafeInteger(finalAssistantRowId) ? finalAssistantRowId : null, assistantTruncated, tools: toolResultsForMessages(messages, start + 1, true) };
}

function isCredentialProbe(task) {
  const action = /\b(?:print|show|dump|reveal|exfiltrate|send|list|read|cat|copy|return|output|display|extract|fetch|inspect)\b/i;
  const envAccess = /\b(?:process\s*\.\s*env|os\s*\.\s*environ(?:\b|\s*[.\[])|os\s*\.\s*getenv\s*\(|getenv\s*\(|printenv\b)/i;
  const secretName = /\b(?:API_SERVER_KEY|API_KEY|API_SECRET|[A-Z][A-Z0-9_]*(?:_API_KEY|_KEY|_ACCESS_TOKEN|_REFRESH_TOKEN|_TOKEN|_CLIENT_SECRET|_OPERATOR_TOKEN|_READ_WRITE_TOKEN|_AUTH_SECRET|_SECRET|_PASSWORD|_CREDENTIALS|_DATABASE_URL))\b/i;
  const secretAssignment = /\b(?:API_SERVER_KEY|API_KEY|API_SECRET|[A-Z][A-Z0-9_]*(?:_API_KEY|_KEY|_ACCESS_TOKEN|_REFRESH_TOKEN|_TOKEN|_CLIENT_SECRET|_OPERATOR_TOKEN|_READ_WRITE_TOKEN|_AUTH_SECRET|_SECRET|_PASSWORD|_CREDENTIALS|_DATABASE_URL))\b["']?\s*[:=]\s*["']?[^\s,;"'<>]+/i;
  const genericSensitiveTarget = /\b(?:environment variables?|\.env(?:\b|\s)|api keys?|access tokens?|refresh tokens?|mcp (?:access|refresh|client|operator)? ?(?:tokens?|secrets?|keys?)|blob (?:read.write )?tokens?|credentials?|secrets?|auth(?:entication)? state|private state|state\.db|session database)\b/i;
  return secretAssignment.test(task)
     || /\bprintenv\b/i.test(task)
     || secretName.test(task)
    || (envAccess.test(task) && action.test(task))
    || (action.test(task) && genericSensitiveTarget.test(task));
}

async function createHermesSession({ title } = {}) {
  const startedAt = Date.now();
  const hardDeadline = startedAt + NATIVE_SEND_BUDGET_MS;
  const operationDeadline = hardDeadline - 1000;
  const safeTitle = await withinDeadline(() => safeOutputText(sanitizeTitle(title), 120), operationDeadline) || 'M2 Hermes session';
  const { client } = await withinDeadline(() => openHermesRpc({ deadline: operationDeadline }), operationDeadline);
  try {
    const created = await withinDeadline(() => client.request('session.create', { title: safeTitle }), operationDeadline);
    const runtimeId = responseSessionId(created, 'session_id');
    const storedId = responseSessionId(created, 'stored_session_id');
    await withinDeadline(() => assertSafeSessionId(storedId), operationDeadline);
    const titleResult = await withinDeadline(() => client.request('session.title', { session_id: runtimeId, title: safeTitle }), operationDeadline);
    if (!titleResult || titleResult.pending !== false || titleResult.title !== safeTitle) {
      throw new HermesError('Hermes could not persist the new session.', 502, 'hermes_session_persist_failed');
    }
    const resumed = await withinDeadline(() => client.request('session.resume', { session_id: storedId }), operationDeadline);
    if (responseCanonicalSessionId(resumed) !== storedId) {
      throw new HermesError('Hermes returned a different session identity.', 502, 'hermes_session_identity_mismatch');
    }
    if (Date.now() >= operationDeadline) throw deadlineError();
    return { session_id: storedId, title: safeTitle };
  } finally {
    const remaining = Math.max(0, hardDeadline - Date.now());
    await client.close(Math.min(300, remaining));
    if (Date.now() >= hardDeadline) throw deadlineError();
  }
}

async function resumeByStoredId(client, storedId) {
  const result = await client.request('session.resume', { session_id: storedId });
  const canonicalId = responseCanonicalSessionId(result);
  const runtimeId = responseSessionId(result, 'session_id');
  if (canonicalId !== storedId) {
    throw new HermesError('Hermes returned a different session identity.', 502, 'hermes_session_identity_mismatch');
  }
  return { result, runtimeId };
}

async function requestComplete(client, runtimeId, storedId, credential, userRowId, eventState, timeoutMs, absoluteDeadline) {
  const deadline = Math.min(Date.now() + timeoutMs, absoluteDeadline);
  while (Date.now() < deadline) {
    const replay = await withinDeadline(
      () => client.request('session.events.since', { session_id: runtimeId, last_seen: eventState.lastSeenSeq }, stageTimeoutMs(CONTROL_TIMEOUT_MS, deadline)),
      deadline,
    );
    if (!replay || !Array.isArray(replay.events) || replay.epoch !== eventState.epoch || replay.truncated === true) {
      eventState.replayUnavailable = true;
    } else if (!eventState.terminal) {
        for (const frame of replay.events) {
          const event = eventParts(frame);
          if (!event) continue;
          if (event.type === 'message.complete' && event.sessionId === runtimeId && event.userRowId === userRowId) {
            const status = requestStatusFromTerminal(event.status);
            if (status === 'completed') {
              if (hasDurableTerminalReceipt(await getPersistedHistory(credential, storedId, deadline), storedId, {
                user_row_id: userRowId,
                final_assistant_row_id: event.finalAssistantRowId,
                task_digest: eventState.taskDigest,
              })) {
                eventState.terminal = { status, finalAssistantRowId: event.finalAssistantRowId };
                eventState.lastSeenSeq = Math.max(eventState.lastSeenSeq, event.seq);
              }
              break;
            } else if (status) {
              eventState.terminal = { status, finalAssistantRowId: event.finalAssistantRowId };
              eventState.lastSeenSeq = Math.max(eventState.lastSeenSeq, event.seq);
            } else {
              eventState.lastSeenSeq = Math.max(eventState.lastSeenSeq, event.seq);
            }
          } else {
            eventState.lastSeenSeq = Math.max(eventState.lastSeenSeq, event.seq);
          }
        }
    }
    if (eventState.terminal) {
      if (eventState.terminal.status === 'failed') throw new HermesError('Hermes reported that the task failed.', 502, 'hermes_turn_failed');
      if (eventState.terminal.status === 'interrupted') throw new HermesError('Hermes reported that the task was interrupted.', 409, 'hermes_turn_interrupted');
      const resumed = await withinDeadline(
        () => client.request('session.resume', { session_id: eventState.storedId }, stageTimeoutMs(CONTROL_TIMEOUT_MS, deadline)),
        deadline,
      );
      const messages = await getPersistedHistory(credential, storedId, deadline);
      const turn = turnMessages(messages, userRowId, eventState.terminal.finalAssistantRowId);
      if (resumed?.running === false && turn?.assistant && turn.assistantRowId === eventState.terminal.finalAssistantRowId) {
        if (Date.now() >= deadline) throw deadlineError();
        return { turn: { ...turn, tools: toolResultsForMessages(messages, messages.findIndex((row) => row.row_id === userRowId) + 1, true) }, resumed };
      }
    }
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(eventState.terminal ? 200 : 500, Math.max(1, deadline - Date.now())),
    ));
  }
  const error = new HermesError('Hermes task did not finish before the deadline; inspect the session before retrying.', 504, 'hermes_turn_timeout');
  error.outcome_unknown = true;
  throw error;
}

async function sendHermesSessionMessage(sessionId, task, options = {}) {
  const startedAt = Date.now();
  const suppliedDeadline = Number.isSafeInteger(options.deadline) ? options.deadline : Infinity;
  const hardDeadline = Math.min(startedAt + NATIVE_SEND_BUDGET_MS, suppliedDeadline);
  if (hardDeadline <= startedAt) throw deadlineError();
  const cleanupReserveMs = Math.min(GUARD_CLEANUP_RESERVE_MS, Math.max(25, Math.floor((hardDeadline - startedAt) / 6)));
  const operationDeadline = hardDeadline - cleanupReserveMs;
  const turnTimeout = readTurnTimeout();
  const storedId = await withinDeadline(() => assertSafeSessionId(sessionId), operationDeadline);
  const normalizedTask = validateTask(task);
  const requestId = options.requestId;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(requestId)) {
    throw new HermesError('Hermes request identifier is invalid.', 400, 'hermes_request_id_invalid');
  }
  const digest = taskDigest(normalizedTask);
  const storedRecord = await readRequestRecord(storedId, requestId, digest);
  if (storedRecord.record?.status === 'failed') throw new HermesError('Hermes reported that the task failed.', 502, 'hermes_turn_failed');
  if (storedRecord.record?.status === 'interrupted') throw new HermesError('Hermes reported that the task was interrupted.', 409, 'hermes_turn_interrupted');
  const alreadySubmitted = Boolean(storedRecord.record);

  const { client, credential } = await withinDeadline(() => openHermesRpc({ deadline: operationDeadline }), operationDeadline);
  const outputSecrets = credential.redactionSecrets || [];
  const outputFingerprints = credentialFingerprints(outputSecrets);
  let outputRedaction = { secrets: outputSecrets, fingerprints: outputFingerprints, deadline: operationDeadline };
  let claim = null;
  let submitAttempted = false;
  let submitRejected = false;
  try {
    const { result: resumed, runtimeId } = await resumeByStoredId(client, storedId);
    claim = await withinDeadline(() => claimRequestGuard(storedId, requestId, digest), operationDeadline);
    if (claim.existing) {
      claim = null;
      throw new HermesError('This Hermes request is already active; inspect it before retrying.', 409, 'hermes_request_in_progress');
    }
    if (resumed.running === true && !alreadySubmitted) throw new HermesError('Hermes session is busy; inspect its current state before sending another task.', 409, 'hermes_session_busy');
    const claimFingerprints = mergeCredentialFingerprints(claim.previous?.credential_fingerprints, outputFingerprints);

    let requestRecord;
    if (!alreadySubmitted) {
      requestRecord = {
        schema_version: 1, request_id: requestId, task_digest: digest,
        status: 'submitting', outcome_unknown: true,
        user_row_id: null, baseline_seq: 0, event_epoch: null, last_seen_seq: 0,
        credential_fingerprints: claimFingerprints,
        created_at: Date.now(), updated_at: Date.now(),
      };
      await writeRequestRecord(storedRecord.path, storedRecord.version, requestRecord);
    } else {
      requestRecord = storedRecord.record;
    }
    if (alreadySubmitted) {
      outputRedaction = {
        secrets: outputSecrets,
        fingerprints: mergeCredentialFingerprints(claimFingerprints, requestRecord.credential_fingerprints),
        deadline: operationDeadline,
      };
    }

    const replay = await withinDeadline(
      () => client.request('session.events.since', { session_id: runtimeId, last_seen: alreadySubmitted ? (requestRecord.last_seen_seq || 0) : 0 }, stageTimeoutMs(CONTROL_TIMEOUT_MS, operationDeadline)),
      operationDeadline,
    );
    if (!replay || !Number.isSafeInteger(replay.latest_seq) || typeof replay.epoch !== 'string') {
      throw new HermesError('Hermes returned invalid event replay metadata.', 502, 'hermes_events_invalid');
    }
    const eventState = {
      terminal: null,
      storedId,
      runtimeId,
      lastSeenSeq: alreadySubmitted
        ? (requestRecord.status === 'completed' ? (requestRecord.baseline_seq || 0) : (requestRecord.last_seen_seq || 0))
        : replay.latest_seq,
      epoch: requestRecord.event_epoch || replay.epoch,
      taskDigest: digest,
    };
    try {
      if (!alreadySubmitted) {
        const beforeSubmit = await getRpcHistory(client, runtimeId, operationDeadline);
        const baselineRowId = beforeSubmit.reduce((max, message) => Number.isSafeInteger(message?.row_id) ? Math.max(max, message.row_id) : max, 0);
        requestRecord = await updateRequestRecord(claim, {
          event_epoch: replay.epoch, baseline_seq: replay.latest_seq,
          last_seen_seq: replay.latest_seq, baseline_row_id: baselineRowId,
          credential_fingerprints: mergeCredentialFingerprints(claimFingerprints, requestRecord.credential_fingerprints, outputFingerprints),
        });
        outputRedaction = { secrets: outputSecrets, fingerprints: requestRecord.credential_fingerprints, deadline: operationDeadline };
        await withinDeadline(() => updateRequestGuard(claim, {
          credential_fingerprints: requestRecord.credential_fingerprints,
          event_epoch: replay.epoch,
          last_seen_seq: replay.latest_seq,
        }), operationDeadline);
        submitAttempted = true;
        let submitted;
        try {
          submitted = await client.request(
            'prompt.submit', { session_id: runtimeId, text: normalizedTask }, stageTimeoutMs(CONTROL_TIMEOUT_MS, operationDeadline),
          );
        } catch (error) {
          submitRejected = error?.remote === true && [
            'hermes_rpc_invalid_request', 'hermes_session_busy', 'hermes_session_not_found',
          ].includes(error.code);
          throw error;
        }
        if (!submitted || submitted.status !== 'streaming' || !Number.isSafeInteger(submitted.user_row_id) || submitted.user_row_id < 1) {
          const unconfirmed = new HermesError('Hermes did not confirm persistence of the submitted task; inspect the session before retrying.', 502, 'hermes_submit_unconfirmed');
          unconfirmed.ambiguous = true;
          throw unconfirmed;
        }
        eventState.userRowId = submitted.user_row_id;
        await withinDeadline(() => updateRequestGuard(claim, {
          status: 'pending', user_row_id: submitted.user_row_id,
          event_epoch: replay.epoch, last_seen_seq: replay.latest_seq,
        }), operationDeadline);
        requestRecord = await updateRequestRecord(claim, {
          status: 'running', user_row_id: submitted.user_row_id,
          event_epoch: replay.epoch, baseline_seq: replay.latest_seq, last_seen_seq: replay.latest_seq,
        });
      } else {
        eventState.userRowId = requestRecord.user_row_id;
      }
      if (!Number.isSafeInteger(eventState.userRowId) || eventState.userRowId < 1) {
        const unknown = new HermesError('Hermes accepted this request but its persisted user row is not yet known; inspect the session before retrying.', 504, 'hermes_turn_timeout');
        unknown.outcome_unknown = true;
        throw unknown;
      }
      if (!eventState.terminal) {
        const history = await getPersistedHistory(credential, storedId, operationDeadline);
        const finalAssistantRowId = Number.isSafeInteger(requestRecord.final_assistant_row_id)
          && hasDurableTerminalReceipt(history, storedId, requestRecord)
          ? requestRecord.final_assistant_row_id
          : discoverDurableFinalRow(history, storedId, requestRecord);
        if (finalAssistantRowId) eventState.terminal = { status: 'completed', finalAssistantRowId };
      }
      const completed = await requestComplete(client, runtimeId, storedId, credential, eventState.userRowId, eventState, alreadySubmitted ? Math.max(1000, operationDeadline - Date.now()) : turnTimeout, operationDeadline);
      const rawMessage = completed.turn.assistant;
      if (!rawMessage) throw new HermesError('Hermes completed the task without a readable assistant response.', 502, 'hermes_result_missing');
      const redacted = await withinDeadline(() => safeOutputText(rawMessage, MAX_ASSISTANT_TEXT, outputRedaction), operationDeadline);
      const message = redacted.slice(0, MAX_ASSISTANT_TEXT);
      const toolNames = await withinDeadline(() => safeToolNames(completed.turn.tools.names, operationDeadline, outputRedaction), operationDeadline);
      const result = {
        session_id: storedId, request_id: requestId, status: 'completed', outcome_unknown: false,
        message, truncated: completed.turn.assistantTruncated || rawMessage.length > MAX_ASSISTANT_TEXT,
        model: await withinDeadline(() => safeOutputText(completed.resumed.info?.model, 120, outputRedaction), operationDeadline),
        provider: await withinDeadline(() => safeOutputText(completed.resumed.info?.provider, 80, outputRedaction), operationDeadline),
        tool_call_count: completed.turn.tools.count, tool_names: toolNames,
      };
      await withinDeadline(() => updateRequestRecord(claim, {
      status: 'completed', outcome_unknown: false, last_seen_seq: eventState.lastSeenSeq,
      final_assistant_row_id: eventState.terminal.finalAssistantRowId,
      }), operationDeadline);
      await withinDeadline(() => updateRequestGuard(claim, {
        status: 'completed', outcome_unknown: false, user_row_id: eventState.userRowId,
        last_seen_seq: eventState.lastSeenSeq,
      }), operationDeadline);
      if (Date.now() >= operationDeadline) throw deadlineError();
      return result;
    } catch (error) {
      if ((!submitAttempted && !alreadySubmitted) || submitRejected) {
        await withinDeadline(() => restoreRequestGuard(claim), hardDeadline).catch(() => {});
      } else {
        if (claim) {
          const status = error?.code === 'hermes_turn_failed' ? 'failed'
            : error?.code === 'hermes_turn_interrupted' ? 'interrupted' : 'timed_out';
          try {
            const outcomeUnknown = status === 'timed_out' || error?.outcome_unknown === true;
            await withinDeadline(() => updateRequestGuard(claim, { status, outcome_unknown: outcomeUnknown }), hardDeadline);
            await withinDeadline(() => updateRequestRecord(claim, { status, outcome_unknown: outcomeUnknown, last_seen_seq: eventState.lastSeenSeq, user_row_id: eventState.userRowId || requestRecord.user_row_id || null }), hardDeadline);
          }
          catch { /* Keep the prior active guard rather than risk duplicate execution. */ }
        }
      }
      throw error;
    }
  } catch (error) {
    if (claim && !submitAttempted && !alreadySubmitted) await withinDeadline(() => restoreRequestGuard(claim), hardDeadline).catch(() => {});
    throw error;
  } finally {
    await client.close(Math.max(0, hardDeadline - Date.now()));
  }
}

async function getHermesSession(sessionId, options = {}) {
  const startedAt = Date.now();
  const suppliedDeadline = Number.isSafeInteger(options.deadline) ? options.deadline : Infinity;
  const hardDeadline = Math.min(startedAt + NATIVE_SEND_BUDGET_MS, suppliedDeadline);
  if (hardDeadline <= startedAt) throw deadlineError();
  const cleanupReserveMs = Math.min(1000, Math.max(25, Math.floor((hardDeadline - startedAt) / 6)));
  const operationDeadline = hardDeadline - cleanupReserveMs;
  const storedId = await withinDeadline(() => assertSafeSessionId(sessionId), operationDeadline);
  let requestId = options.requestId;
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(requestId))) {
    throw new HermesError('Hermes request identifier is invalid.', 400, 'hermes_request_id_invalid');
  }
  const store = getStateStore();
  let latestGuard = (await withinDeadline(() => store.readVersionedJson(requestGuardPath(storedId)), operationDeadline))?.value || null;
  if (requestId === undefined) requestId = latestGuard?.request_id || undefined;
  let requestRecord = null;
  let requestPath = null;
  if (requestId) {
    requestPath = requestRecordPath(storedId, requestId);
    requestRecord = (await withinDeadline(() => store.readVersionedJson(requestPath), operationDeadline))?.value || null;
  }
  const { client, credential } = await withinDeadline(() => openHermesRpc({ deadline: operationDeadline }), operationDeadline);
  try {
    const outputRedaction = {
      secrets: credential.redactionSecrets || [],
      fingerprints: mergeCredentialFingerprints(requestRecord?.credential_fingerprints, latestGuard?.credential_fingerprints),
      deadline: operationDeadline,
    };
    const { result: resumed, runtimeId } = await withinDeadline(() => resumeByStoredId(client, storedId), operationDeadline);
    if (requestRecord && requestRecord.status !== 'completed' && requestRecord.status !== 'failed' && requestRecord.status !== 'interrupted'
      && Number.isSafeInteger(requestRecord.user_row_id)) {
      try {
        const replay = await withinDeadline(() => client.request('session.events.since', {
          session_id: runtimeId,
          last_seen: Number.isSafeInteger(requestRecord.last_seen_seq) ? requestRecord.last_seen_seq : 0,
        }), operationDeadline);
        if (replay && Array.isArray(replay.events) && replay.epoch === requestRecord.event_epoch && replay.truncated !== true) {
          let terminal = null;
          let finalAssistantRowId = null;
          let terminalSeq = null;
          let lastSeenSeq = requestRecord.last_seen_seq || 0;
          for (const frame of replay.events) {
            const event = eventParts(frame);
            if (!event) continue;
            if (event.type === 'message.complete' && event.sessionId === runtimeId
              && event.userRowId === requestRecord.user_row_id) {
              const status = requestStatusFromTerminal(event.status);
              if (status === 'completed') {
                terminal = status;
                finalAssistantRowId = event.finalAssistantRowId;
                terminalSeq = event.seq;
                break;
              } else if (status) {
                terminal = status;
                finalAssistantRowId = event.finalAssistantRowId;
                terminalSeq = event.seq;
                lastSeenSeq = Math.max(lastSeenSeq, event.seq);
              } else {
                lastSeenSeq = Math.max(lastSeenSeq, event.seq);
              }
            } else {
              lastSeenSeq = Math.max(lastSeenSeq, event.seq);
            }
          }
          if (terminal === 'completed') {
            const history = await getPersistedHistory(credential, storedId, operationDeadline);
            if (!hasDurableTerminalReceipt(history, storedId, {
              user_row_id: requestRecord.user_row_id,
              final_assistant_row_id: finalAssistantRowId,
              task_digest: requestRecord.task_digest,
            })) {
              terminal = null;
              lastSeenSeq = Math.min(lastSeenSeq, Math.max(0, (terminalSeq || 1) - 1));
            } else {
              lastSeenSeq = Math.max(lastSeenSeq, terminalSeq || 0);
            }
          }
          if (terminal) {
            const updateClaim = { requestId, task_digest: requestRecord.task_digest, recordPath: requestPath };
            requestRecord = await withinDeadline(() => updateRequestRecord(updateClaim, {
              status: terminal, outcome_unknown: false, last_seen_seq: lastSeenSeq,
              final_assistant_row_id: finalAssistantRowId,
            }), operationDeadline);
            await withinDeadline(() => updateRequestGuard({ path: requestGuardPath(storedId), requestId }, {
              status: terminal, outcome_unknown: false, user_row_id: requestRecord.user_row_id,
              last_seen_seq: lastSeenSeq,
            }), operationDeadline);
          } else if (lastSeenSeq !== requestRecord.last_seen_seq) {
            requestRecord = await withinDeadline(() => updateRequestRecord({ requestId, task_digest: requestRecord.task_digest, recordPath: requestPath }, { last_seen_seq: lastSeenSeq }), operationDeadline);
          }
        }
      } catch (error) {
        if (Date.now() >= operationDeadline || error?.code === 'hermes_native_send_deadline') throw deadlineError();
        /* Inspect still reports the persisted outcome as unknown if reconciliation is unavailable. */
      }
    }
    if (requestRecord && !['completed', 'failed', 'interrupted'].includes(requestRecord.status)
      && Number.isSafeInteger(requestRecord.user_row_id)) {
      try {
        const history = await getPersistedHistory(credential, storedId, operationDeadline);
        const finalAssistantRowId = discoverDurableFinalRow(history, storedId, requestRecord);
        if (finalAssistantRowId) {
          const lastSeenSeq = Number.isSafeInteger(requestRecord.last_seen_seq) ? requestRecord.last_seen_seq : 0;
          const updateClaim = { requestId, task_digest: requestRecord.task_digest, recordPath: requestPath };
          requestRecord = await withinDeadline(() => updateRequestRecord(updateClaim, {
            status: 'completed', outcome_unknown: false, final_assistant_row_id: finalAssistantRowId,
          }), operationDeadline);
          await withinDeadline(() => updateRequestGuard({ path: requestGuardPath(storedId), requestId }, {
            status: 'completed', outcome_unknown: false, user_row_id: requestRecord.user_row_id,
            last_seen_seq: lastSeenSeq,
          }), operationDeadline);
        }
      } catch (error) {
        if (Date.now() >= operationDeadline || error?.code === 'hermes_native_send_deadline') throw deadlineError();
        /* Invalid or unavailable persisted proof leaves the request unknown. */
      }
    }
    const [messages, title] = await Promise.all([
      getPersistedHistory(credential, storedId, operationDeadline),
      withinDeadline(() => client.request('session.title', { session_id: runtimeId }), operationDeadline),
    ]);
    let executionMessage = null;
    let executionTruncated = false;
    let executionTools = { count: 0, names: [] };
    let executionToolNames = [];
    if (requestRecord?.status === 'completed' && Number.isSafeInteger(requestRecord.user_row_id)
      && Number.isSafeInteger(requestRecord.final_assistant_row_id)) {
      const turn = turnMessages(messages, requestRecord.user_row_id, requestRecord.final_assistant_row_id);
      if (turn?.assistant && turn.assistantRowId === requestRecord.final_assistant_row_id) {
        executionMessage = await withinDeadline(() => safeOutputText(turn.assistant, MAX_INSPECTED_ASSISTANT_TEXT, outputRedaction), operationDeadline);
        executionTruncated = turn.assistantTruncated || turn.assistant.length > MAX_INSPECTED_ASSISTANT_TEXT;
        executionTools = turn.tools;
        executionToolNames = await safeToolNames(executionTools.names, operationDeadline, outputRedaction);
      }
    }
    const toolSummary = toolResultsForMessages(messages, 0, false);
    let lastAssistant = null;
    if (resumed.running !== true) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === 'assistant' && Number.isSafeInteger(messages[i].row_id)) {
          lastAssistant = await withinDeadline(() => safeOutputText(messages[i].text, MAX_INSPECTED_ASSISTANT_TEXT, outputRedaction), operationDeadline);
          break;
        }
      }
    }
    const info = resumed.info && typeof resumed.info === 'object' ? resumed.info : {};
    const safeToolNamesResult = await safeToolNames(toolSummary.names, operationDeadline, outputRedaction);
    let execution = null;
    if (requestRecord) {
      const status = requestRecord.status === 'submitting' ? 'submitted' : requestRecord.status;
      execution = {
        request_id: requestRecord.request_id,
        status,
        outcome_unknown: requestRecord.outcome_unknown !== false,
        message: executionMessage,
        truncated: executionTruncated,
        tool_call_count: Math.min(Number.isSafeInteger(executionTools.count) ? executionTools.count : 0, 1000),
        tool_names: executionToolNames,
      };
    }
    const result = {
      session_id: storedId,
      title: await withinDeadline(() => safeOutputText(title?.title, 120, outputRedaction), operationDeadline),
      model: await withinDeadline(() => safeOutputText(info.model, 120, outputRedaction), operationDeadline),
      message_count: messages.length,
      tool_call_count: toolSummary.count,
      tool_names: safeToolNamesResult,
      last_assistant_message: lastAssistant,
      execution,
    };
    if (Date.now() >= operationDeadline) throw deadlineError();
    return result;
  } finally {
    const remaining = Math.max(0, hardDeadline - Date.now());
    await client.close(Math.min(300, remaining));
    if (Date.now() >= hardDeadline) throw deadlineError();
  }
}

async function getHermesStatus() {
  const origin = normalizeCloudOrigin();
  const [status, auth] = await Promise.all([
    requestCloudJson('/api/status', { timeoutMs: CONTROL_TIMEOUT_MS }),
    require('./hermes-cloud-auth').getCredentialMetadata(),
  ]);
  const version = await safeOutputText(status?.version, 80);
  const authFlows = Array.isArray(status?.auth_flows)
    ? status.auth_flows.filter((item) => item === 'cookie' || item === 'native_pkce')
    : [];
  return {
    connected: true,
    runtime: 'hermes-cloud-native',
    origin_host: new URL(origin).hostname,
    version,
    auth_required: status?.auth_required === true,
    auth_flows: authFlows,
    authenticated: auth.authenticated,
    auth_provider: safeName(await safeOutputText(auth.provider, 80)),
  };
}

async function sendHermesMessage(message) {
  const task = validateTask(message);
  const session = await createHermesSession({ title: 'M2 Hermes message' });
  const result = await sendHermesSessionMessage(session.session_id, task);
  return {
    message: result.message,
    model: result.model,
    provider: result.provider,
    session_id: result.session_id,
  };
}

module.exports = {
  HermesError,
  createHermesSession,
  getHermesSession,
  getHermesStatus,
  readTurnTimeout,
  sendHermesMessage,
  sendHermesSessionMessage,
  validateSessionId,
};
