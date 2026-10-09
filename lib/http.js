'use strict';

const REQUEST_BODY_TIMEOUT_MS = 10_000;
let requestBodyTimeoutOverrideForTests = null;

function sendJson(res, statusCode, body, headers = {}) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function sendHtml(res, statusCode, html, headers = {}) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(html);
}

async function readBodyWithoutDeadline(req, maxBytes, readerControl) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError('Maximum request body size is invalid.');
  }

  const tooLarge = () => {
    const error = new Error('Request body too large.');
    error.statusCode = 413;
    return error;
  };

  const invalidBody = () => {
    const error = new Error('Request body is invalid.');
    error.statusCode = 400;
    return error;
  };

  if (req.body != null) {
    if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
      if (req.body.byteLength > maxBytes) throw tooLarge();
      return Buffer.from(req.body).toString('utf8');
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > maxBytes) throw tooLarge();
      return req.body;
    }
    if (typeof req.body === 'object') {
      let serialized;
      try {
        serialized = JSON.stringify(req.body);
      } catch {
        throw invalidBody();
      }
      if (typeof serialized !== 'string') throw invalidBody();
      if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw tooLarge();
      return serialized;
    }
    throw invalidBody();
  }

  let size = 0;
  const chunks = [];
  const iterator = req[Symbol.asyncIterator]();
  readerControl.iterator = iterator;
  try {
    while (true) {
      const item = await iterator.next();
      if (item.done) break;
      const buffer = Buffer.isBuffer(item.value) ? item.value : Buffer.from(item.value);
      size += buffer.length;
      if (size > maxBytes) throw tooLarge();
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    readerControl.iterator = null;
  }
}

async function readBody(req, maxBytes = 64 * 1024) {
  const timeoutMs = requestBodyTimeoutOverrideForTests ?? REQUEST_BODY_TIMEOUT_MS;
  const readerControl = { iterator: null };
  const cancelReader = () => {
    try { req.pause?.(); } catch { /* Request may already be closed. */ }
    try { Promise.resolve(readerControl.iterator?.return?.()).catch(() => {}); } catch { /* Best effort. */ }
  };
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      cancelReader();
      const error = new Error('Request body read timed out.');
      error.statusCode = 408;
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([readBodyWithoutDeadline(req, maxBytes, readerControl), timeout]);
  } catch (error) {
    if (error?.statusCode === 413) cancelReader();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function setRequestBodyTimeoutForTests(timeoutMs = null) {
  if (timeoutMs !== null && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || timeoutMs > REQUEST_BODY_TIMEOUT_MS)) {
    throw new TypeError('Request body timeout is invalid.');
  }
  requestBodyTimeoutOverrideForTests = timeoutMs;
}

async function readJson(req, maxBytes) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      && !(req.body instanceof Uint8Array)) {
    await readBody(req, maxBytes);
    return req.body;
  }
  const raw = await readBody(req, maxBytes);
  return raw ? JSON.parse(raw) : {};
}

async function readForm(req, maxBytes) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      && !(req.body instanceof Uint8Array)) {
    await readBody(req, maxBytes);
    return req.body;
  }
  const raw = await readBody(req, maxBytes);
  return Object.fromEntries(new URLSearchParams(raw));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

module.exports = {
  escapeHtml,
  readBody,
  readForm,
  readJson,
  sendHtml,
  sendJson,
  setRequestBodyTimeoutForTests,
};
