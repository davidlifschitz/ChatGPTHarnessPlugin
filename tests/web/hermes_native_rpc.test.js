'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { WebSocketServer } = require('ws');

const { getHermesSession } = require('../../lib/hermes');
const { MemoryStateStore, setStateStoreForTests } = require('../../lib/state-store');
const { persistCredentials } = require('../../lib/hermes-cloud-auth');

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

test('native WebSocket rejects oversized frames and does not include frame content in errors', async () => {
  const oldOrigin = process.env.HERMES_CLOUD_ORIGIN;
  const store = new MemoryStateStore();
  setStateStoreForTests(store);
  const server = http.createServer((req, res) => {
    if (req.url === '/api/auth/ws-ticket') return json(res, 200, { ticket: 'x'.repeat(32), ttl_seconds: 30 });
    return json(res, 404, {});
  });
  const wss = new WebSocketServer({ noServer: true, handleProtocols: () => 'hermes-gateway-v1' });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.HERMES_CLOUD_ORIGIN = origin;
  await persistCredentials({
    cloud_origin: origin, access_token: 'rpc-access-secret-sentinel',
    refresh_token: 'rpc-refresh-secret-sentinel', token_type: 'Bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, provider: 'provider-rpc', user_id: 'user-rpc',
  });
  wss.on('connection', (ws) => {
    ws.send(`${JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready' } })}\n`);
    setTimeout(() => {
      if (ws.readyState === ws.OPEN) ws.send(`${JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'oversized', content: 'frame-secret-sentinel'.repeat(60000) } })}\n`);
    }, 20);
  });

  try {
    await assert.rejects(() => getHermesSession('stored-1'), (error) => {
      assert.equal(error.message.includes('frame-secret-sentinel'), false);
      assert.equal(error.message.includes('rpc-access-secret-sentinel'), false);
      return true;
    });
  } finally {
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    setStateStoreForTests(null);
    if (oldOrigin === undefined) delete process.env.HERMES_CLOUD_ORIGIN; else process.env.HERMES_CLOUD_ORIGIN = oldOrigin;
  }
});
