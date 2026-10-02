'use strict';

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

async function readBody(req, maxBytes = 64 * 1024) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    if (typeof req.body === 'string') return req.body;
    if (typeof req.body === 'object') return JSON.stringify(req.body);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req, maxBytes) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = await readBody(req, maxBytes);
  return raw ? JSON.parse(raw) : {};
}

async function readForm(req, maxBytes) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
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

module.exports = { escapeHtml, readBody, readForm, readJson, sendHtml, sendJson };
