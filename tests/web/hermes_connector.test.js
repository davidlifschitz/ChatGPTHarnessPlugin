const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { getHermesStatus, sendHermesMessage } = require('../../lib/hermes');

async function withHermesServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  process.env.HERMES_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.HERMES_API_KEY = 'test-secret-key';
  try {
    await fn();
  } finally {
    if (oldBase === undefined) delete process.env.HERMES_BASE_URL; else process.env.HERMES_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json', 'content-length': data.length});
  res.end(data);
}

test('status discovers model and sends bearer auth without exposing config', async () => {
  const seenAuth = [];
  await withHermesServer((req, res) => {
    seenAuth.push(req.headers.authorization);
    if (req.url === '/v1/capabilities') return json(res, 200, {sessions: true, streaming: true});
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'profile-main'}]});
    return json(res, 404, {error: 'not found'});
  }, async () => {
    const result = await getHermesStatus();
    assert.equal(result.connected, true);
    assert.equal(result.model, 'profile-main');
    assert.deepEqual(result.capabilities, {sessions: true, streaming: true});
    assert.deepEqual(seenAuth, ['Bearer test-secret-key', 'Bearer test-secret-key']);
    assert.equal(JSON.stringify(result).includes('test-secret-key'), false);
    assert.equal(JSON.stringify(result).includes(process.env.HERMES_BASE_URL), false);
  });
});

test('chat discovers advertised model and returns assistant text', async () => {
  let chatBody;
  await withHermesServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test-secret-key') return json(res, 401, {error: 'bad auth'});
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'profile-main'}]});
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => raw += chunk);
      req.on('end', () => {
        chatBody = JSON.parse(raw);
        json(res, 200, {choices: [{message: {role: 'assistant', content: 'phone-test-ok'}}]});
      });
      return;
    }
    return json(res, 404, {error: 'not found'});
  }, async () => {
    const result = await sendHermesMessage('Reply with exactly: phone-test-ok');
    assert.equal(result.message, 'phone-test-ok');
    assert.equal(result.model, 'profile-main');
    assert.equal(chatBody.model, 'profile-main');
    assert.deepEqual(chatBody.messages, [{role: 'user', content: 'Reply with exactly: phone-test-ok'}]);
  });
});

test('upstream errors redact the bearer credential', async () => {
  await withHermesServer((req, res) => {
    return json(res, 401, {error: 'credential test-secret-key rejected'});
  }, async () => {
    await assert.rejects(() => getHermesStatus(), (err) => {
      assert.equal(String(err.message).includes('test-secret-key'), false);
      assert.match(err.message, /HTTP 401/);
      return true;
    });
  });
});

test('missing server configuration is explicit and secret-free', async () => {
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_API_KEY;
  try {
    await assert.rejects(() => getHermesStatus(), /HERMES_BASE_URL and HERMES_API_KEY/);
  } finally {
    if (oldBase !== undefined) process.env.HERMES_BASE_URL = oldBase;
    if (oldKey !== undefined) process.env.HERMES_API_KEY = oldKey;
  }
});
