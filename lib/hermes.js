'use strict';

class HermesError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'HermesError';
    this.statusCode = statusCode;
  }
}

function config() {
  const baseUrl = (process.env.HERMES_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.HERMES_API_KEY || '').trim();
  if (!baseUrl || !apiKey) {
    throw new HermesError('Hermes is not configured. Set HERMES_BASE_URL and HERMES_API_KEY on the server.', 503);
  }
  return { baseUrl, apiKey };
}

function redact(text, secret) {
  if (!text) return '';
  return String(text).split(secret).join('[REDACTED]');
}

async function requestJson(path, options = {}) {
  const { baseUrl, apiKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(options.body ? {'content-type': 'application/json'} : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? `Hermes rejected the server credential (HTTP ${response.status}).`
        : `Hermes returned HTTP ${response.status} for ${path}.`;
      throw new HermesError(message, response.status === 401 || response.status === 403 ? 502 : response.status);
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      throw new HermesError(`Hermes returned non-JSON data for ${path}.`, 502);
    }
  } catch (error) {
    if (error instanceof HermesError) throw error;
    const message = error && error.name === 'AbortError'
      ? `Hermes request timed out for ${path}.`
      : `Could not reach Hermes for ${path}: ${redact(error && error.message ? error.message : error, apiKey)}`;
    throw new HermesError(message, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function advertisedModel(models) {
  const id = models && Array.isArray(models.data) && models.data[0] && models.data[0].id;
  if (typeof id !== 'string' || !id.trim()) {
    throw new HermesError('Hermes /v1/models did not advertise a usable model id.', 502);
  }
  return id.trim();
}

async function getHermesStatus() {
  const [capabilities, models] = await Promise.all([
    requestJson('/v1/capabilities'),
    requestJson('/v1/models'),
  ]);
  return {
    connected: true,
    model: advertisedModel(models),
    capabilities: capabilities || {},
  };
}

async function sendHermesMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new HermesError('Message must not be empty.', 400);
  }
  if (message.length > 20000) {
    throw new HermesError('Message is too long for this M1 test surface.', 413);
  }
  const models = await requestJson('/v1/models');
  const model = advertisedModel(models);
  const response = await requestJson('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: message.trim() }],
      stream: false,
    }),
  });
  const content = response && response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  if (typeof content !== 'string') {
    throw new HermesError('Hermes returned a chat response without assistant text.', 502);
  }
  return { message: content, model };
}

module.exports = {
  HermesError,
  getHermesStatus,
  sendHermesMessage,
};
