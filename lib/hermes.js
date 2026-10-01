'use strict';

const DEFAULT_TIMEOUT_MS = 60000;
const MIN_TIMEOUT_MS = 50;
const MAX_TIMEOUT_MS = 120000;
const MAX_SESSION_ID_LENGTH = 200;
const MAX_TASK_LENGTH = 12000;
const MAX_RESULT_LENGTH = 12000;
const MAX_INSPECTED_MESSAGES = 200;

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
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function config() {
  const baseUrl = (process.env.HERMES_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.HERMES_API_KEY || '').trim();
  if (!baseUrl || !apiKey) {
    throw new HermesError(
      'Hermes is not configured on the server.',
      503,
      'hermes_not_configured',
    );
  }
  return { baseUrl, apiKey, timeoutMs: timeoutMs() };
}

function redact(text, values = []) {
  let sanitized = String(text || '');
  for (const value of values) {
    if (value) sanitized = sanitized.split(String(value)).join('[REDACTED]');
  }
  return sanitized.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
}

function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new HermesError('Hermes request path is invalid.', 500, 'invalid_internal_path');
  }
  return path;
}

async function requestJson(path, options = {}) {
  const { baseUrl, apiKey, timeoutMs: requestTimeoutMs } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const requestPath = safePath(path);
  try {
    const response = await fetch(`${baseUrl}${requestPath}`, {
      ...options,
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new HermesError(
          `Hermes rejected the server credential (HTTP ${response.status}).`,
          502,
          'hermes_auth_rejected',
          response.status,
        );
      }
      if (response.status === 404) {
        throw new HermesError('Hermes resource was not found.', 404, 'hermes_not_found', 404);
      }
      if (response.status >= 400 && response.status < 500) {
        throw new HermesError(
          `Hermes rejected the request (HTTP ${response.status}).`,
          response.status,
          'hermes_request_rejected',
          response.status,
        );
      }
      throw new HermesError(
        `Hermes returned HTTP ${response.status}.`,
        502,
        'hermes_upstream_error',
        response.status,
      );
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new HermesError('Hermes returned malformed JSON.', 502, 'hermes_malformed_response');
    }
  } catch (error) {
    if (error instanceof HermesError) throw error;
    if (error && error.name === 'AbortError') {
      throw new HermesError('Hermes request timed out.', 504, 'hermes_timeout');
    }
    const safeDetail = redact(error && error.message ? error.message : error, [apiKey, baseUrl]);
    throw new HermesError(
      safeDetail ? `Could not reach Hermes: ${safeDetail}` : 'Could not reach Hermes.',
      502,
      'hermes_unreachable',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function advertisedModel(models) {
  const id = models && Array.isArray(models.data) && models.data[0] && models.data[0].id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new HermesError(
      'Hermes /v1/models did not advertise a usable model id.',
      502,
      'hermes_model_missing',
    );
  }
  return id.trim();
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string') {
    throw new HermesError('Session identifier must be a string.', 400, 'invalid_session_id');
  }
  const normalized = sessionId.trim();
  if (!normalized || normalized.length > MAX_SESSION_ID_LENGTH || !/^[A-Za-z0-9._:@-]+$/.test(normalized)) {
    throw new HermesError('Session identifier is invalid.', 400, 'invalid_session_id');
  }
  return normalized;
}

function validateTask(task) {
  if (typeof task !== 'string' || !task.trim()) {
    throw new HermesError('Task must not be empty.', 400, 'invalid_task');
  }
  const normalized = task.trim();
  if (normalized.length > MAX_TASK_LENGTH) {
    throw new HermesError('Task is too long.', 413, 'task_too_long');
  }
  return normalized;
}

function truncateText(value, limit) {
  if (typeof value !== 'string') return { text: '', truncated: false };
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: value.slice(0, limit), truncated: true };
}

function unwrapSession(payload) {
  const session = payload && payload.session;
  const id = session && session.id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new HermesError('Hermes returned a session without an id.', 502, 'hermes_session_invalid');
  }
  return session;
}

function toolNamesFromMessages(messages) {
  const names = new Set();
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (typeof message.tool_name === 'string' && message.tool_name.trim()) {
      names.add(message.tool_name.trim().slice(0, 120));
    }
    if (!Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls) {
      if (!call || typeof call !== 'object') continue;
      const name = typeof call.name === 'string'
        ? call.name
        : call.function && typeof call.function.name === 'string'
          ? call.function.name
          : '';
      if (name.trim()) names.add(name.trim().slice(0, 120));
    }
  }
  return [...names].slice(0, 20);
}

function lastAssistantText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant' || typeof message.content !== 'string') continue;
    return truncateText(message.content, 4000).text;
  }
  return null;
}

async function getHermesStatus() {
  // Preserve the explicit local configuration error instead of collapsing it
  // into an upstream health summary.
  config();

  const checks = await Promise.allSettled([
    requestJson('/v1/capabilities'),
    requestJson('/v1/models'),
    requestJson('/api/sessions?limit=1&offset=0'),
  ]);
  const labels = ['capabilities', 'models', 'sessions'];
  const failures = checks
    .map((result, index) => ({ result, label: labels[index] }))
    .filter(({ result }) => result.status === 'rejected');

  if (failures.length) {
    const summary = failures.map(({ result, label }) => {
      const reason = result.reason;
      const status = reason instanceof HermesError
        ? (reason.upstreamStatus || reason.statusCode)
        : 500;
      return `${label}=HTTP ${status}`;
    }).join(', ');
    throw new HermesError(
      `Hermes health checks failed: ${summary}.`,
      502,
      'hermes_status_failed',
    );
  }

  const capabilities = checks[0].value;
  const models = checks[1].value;
  const sessions = checks[2].value;
  const sessionData = sessions && Array.isArray(sessions.data) ? sessions.data : null;
  if (!sessionData) {
    throw new HermesError('Hermes /api/sessions returned an unexpected response.', 502, 'hermes_sessions_invalid');
  }
  return {
    connected: true,
    model: advertisedModel(models),
    capabilities: capabilities || {},
    sessions_api: true,
  };
}

async function sendHermesMessage(message) {
  const normalized = validateTask(message);
  const models = await requestJson('/v1/models');
  const model = advertisedModel(models);
  const response = await requestJson('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: normalized }],
      stream: false,
    }),
  });
  const content = response && response.choices && response.choices[0]
    && response.choices[0].message && response.choices[0].message.content;
  if (typeof content !== 'string') {
    throw new HermesError(
      'Hermes returned a chat response without assistant text.',
      502,
      'hermes_chat_invalid',
    );
  }
  return { message: content, model };
}

async function createHermesSession({ title } = {}) {
  let normalizedTitle = null;
  if (title !== undefined && title !== null) {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
      throw new HermesError('Session title is invalid.', 400, 'invalid_session_title');
    }
    normalizedTitle = title.trim();
  }
  const body = { source: 'chatgpt_plugin' };
  if (normalizedTitle) body.title = normalizedTitle;
  const payload = await requestJson('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const session = unwrapSession(payload);
  return {
    session_id: validateSessionId(session.id),
    title: typeof session.title === 'string' && session.title
      ? session.title.slice(0, 120)
      : normalizedTitle,
  };
}

async function sendHermesSessionMessage(sessionId, task) {
  const normalizedSessionId = validateSessionId(sessionId);
  const normalizedTask = validateTask(task);
  const payload = await requestJson(`/api/sessions/${encodeURIComponent(normalizedSessionId)}/chat`, {
    method: 'POST',
    body: JSON.stringify({ input: normalizedTask }),
  });
  const returnedSessionId = validateSessionId(payload && payload.session_id ? payload.session_id : normalizedSessionId);
  const content = payload && payload.message && payload.message.content;
  if (typeof content !== 'string') {
    throw new HermesError(
      'Hermes returned a session turn without assistant text.',
      502,
      'hermes_chat_invalid',
    );
  }
  const result = truncateText(content, MAX_RESULT_LENGTH);
  const runtime = payload && payload.runtime && typeof payload.runtime === 'object' ? payload.runtime : {};
  return {
    session_id: returnedSessionId,
    message: result.text,
    truncated: result.truncated,
    model: typeof runtime.model === 'string' && runtime.model ? runtime.model : null,
    provider: typeof runtime.provider === 'string' && runtime.provider ? runtime.provider : null,
  };
}

async function getHermesSession(sessionId) {
  const normalizedSessionId = validateSessionId(sessionId);
  const encoded = encodeURIComponent(normalizedSessionId);
  const [sessionPayload, messagesPayload] = await Promise.all([
    requestJson(`/api/sessions/${encoded}`),
    requestJson(`/api/sessions/${encoded}/messages?limit=${MAX_INSPECTED_MESSAGES}&offset=0&order=latest`),
  ]);
  const session = unwrapSession(sessionPayload);
  const messages = messagesPayload && Array.isArray(messagesPayload.data) ? messagesPayload.data : null;
  if (!messages) {
    throw new HermesError(
      'Hermes returned invalid session history.',
      502,
      'hermes_messages_invalid',
    );
  }
  const toolNames = toolNamesFromMessages(messages);
  return {
    session_id: validateSessionId(session.id),
    title: typeof session.title === 'string' && session.title
      ? session.title.slice(0, 120)
      : null,
    model: typeof session.model === 'string' && session.model ? session.model : null,
    message_count: Number.isInteger(session.message_count) && session.message_count >= 0
      ? session.message_count
      : messages.length,
    tool_call_count: Number.isInteger(session.tool_call_count) && session.tool_call_count >= 0
      ? session.tool_call_count
      : toolNames.length,
    tool_names: toolNames,
    last_assistant_message: lastAssistantText(messages),
  };
}

module.exports = {
  HermesError,
  getHermesStatus,
  sendHermesMessage,
  createHermesSession,
  sendHermesSessionMessage,
  getHermesSession,
};
