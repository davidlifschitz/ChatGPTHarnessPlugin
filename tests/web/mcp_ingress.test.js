const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const handler = require('../../api/mcp');

async function withMcpServer(fn) {
  const old = process.env.M2_PUBLIC_ORIGIN;
  process.env.M2_PUBLIC_ORIGIN = 'https://m2.example.test';
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
      res.statusCode = 500;
      res.end('Controlled server failure.');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}/mcp`); }
  finally {
    await new Promise(resolve => server.close(resolve));
    if (old === undefined) delete process.env.M2_PUBLIC_ORIGIN;
    else process.env.M2_PUBLIC_ORIGIN = old;
  }
}

test('M2 ingress rejects unauthenticated MCP initialization before tool dispatch', async () => {
  await withMcpServer(async url => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'unauthorized', version: '1' },
      } }),
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('www-authenticate'), /resource_metadata="https:\/\/m2\.example\.test\/\.well-known\/oauth-protected-resource(?:\/mcp)?"/);
    assert.equal((await response.text()).includes('m1-canary-v1'), false);
  });
});

test('MCP ingress bounds a framework-parsed body before passing it to the SDK', async () => {
  const old = process.env.M2_PUBLIC_ORIGIN;
  delete process.env.M2_PUBLIC_ORIGIN;
  const res = {
    statusCode: 200, headers: {}, headersSent: false, writableEnded: false, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = value; this.writableEnded = true; },
  };
  try {
    await handler({ method: 'POST', url: '/mcp', headers: {}, body: {
      jsonrpc: '2.0', id: 1, method: 'ping', params: { data: 'x'.repeat(65 * 1024) },
    } }, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.includes('x'.repeat(100)), false);
  } finally { if (old !== undefined) process.env.M2_PUBLIC_ORIGIN = old; }
});

test('M2 ingress rejects an invalid bearer and does not leak it', async () => {
  await withMcpServer(async url => {
    const response = await fetch(url, { method: 'GET', headers: {
      authorization: 'Bearer SECRET_SENTINEL', accept: 'application/json, text/event-stream',
    } });
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes('SECRET_SENTINEL'), false);
  });
});

test('MCP transport rejects an oversized JSON body before SDK buffering or dispatch', async () => {
  await withMcpServer(async url => {
    delete process.env.M2_PUBLIC_ORIGIN;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: {
        data: 'x'.repeat(65 * 1024),
      } }),
    });
    assert.equal(response.status, 413);
    const text = await response.text();
    assert.equal(text.includes('x'.repeat(100)), false);
    assert.equal(text.includes('m1_canary_action'), false);
  });
});
