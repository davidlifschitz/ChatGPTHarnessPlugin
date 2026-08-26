const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const statusHandler = require('../../api/status');
const chatHandler = require('../../api/chat');

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function withHermesServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HERMES_API_KEY = 'handler-secret';
  try { await fn(); } finally {
    if (oldBase === undefined) delete process.env.HERMES_BASE_URL; else process.env.HERMES_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey;
    await new Promise((resolve) => server.close(resolve));
  }
}

function json(res, status, body) {
  res.writeHead(status, {'content-type': 'application/json'});
  res.end(JSON.stringify(body));
}

test('status route returns connection state without config', async () => {
  await withHermesServer((req, res) => {
    if (req.url === '/v1/capabilities') return json(res, 200, {streaming: true});
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'test-profile'}]});
    return json(res, 404, {});
  }, async () => {
    const res = mockResponse();
    await statusHandler({method: 'GET'}, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.connected, true);
    assert.equal(res.body.model, 'test-profile');
    assert.equal(JSON.stringify(res.body).includes('handler-secret'), false);
    assert.equal(JSON.stringify(res.body).includes(process.env.HERMES_BASE_URL), false);
  });
});

test('chat route accepts a message and returns assistant text', async () => {
  await withHermesServer((req, res) => {
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'test-profile'}]});
    if (req.url === '/v1/chat/completions') return json(res, 200, {choices: [{message: {content: 'ok'}}]});
    return json(res, 404, {});
  }, async () => {
    const res = mockResponse();
    await chatHandler({method: 'POST', body: {message: 'hello'}}, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {message: 'ok', model: 'test-profile'});
  });
});

test('routes reject unsupported methods', async () => {
  let res = mockResponse();
  await statusHandler({method: 'POST'}, res);
  assert.equal(res.statusCode, 405);
  res = mockResponse();
  await chatHandler({method: 'GET'}, res);
  assert.equal(res.statusCode, 405);
});

test('chat route reports missing configuration without exposing secret values', async () => {
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_API_KEY;
  try {
    const res = mockResponse();
    await chatHandler({method: 'POST', body: {message: 'hello'}}, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /not configured/i);
  } finally {
    if (oldBase !== undefined) process.env.HERMES_BASE_URL = oldBase;
    if (oldKey !== undefined) process.env.HERMES_API_KEY = oldKey;
  }
});
