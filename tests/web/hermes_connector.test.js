const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const {
  getHermesStatus,
  sendHermesMessage,
  createHermesSession,
  sendHermesSessionMessage,
  getHermesSession,
} = require('../../lib/hermes');

async function withHermesServer(handler, fn, options = {}) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  const oldTimeout = process.env.HERMES_REQUEST_TIMEOUT_MS;
  process.env.HERMES_BASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.HERMES_API_KEY = 'test-secret-key';
  if (options.timeoutMs) process.env.HERMES_REQUEST_TIMEOUT_MS = String(options.timeoutMs);
  try {
    await fn({ baseUrl: process.env.HERMES_BASE_URL });
  } finally {
    if (oldBase === undefined) delete process.env.HERMES_BASE_URL; else process.env.HERMES_BASE_URL = oldBase;
    if (oldKey === undefined) delete process.env.HERMES_API_KEY; else process.env.HERMES_API_KEY = oldKey;
    if (oldTimeout === undefined) delete process.env.HERMES_REQUEST_TIMEOUT_MS; else process.env.HERMES_REQUEST_TIMEOUT_MS = oldTimeout;
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {'content-type': 'application/json', 'content-length': data.length});
  res.end(data);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

test('status verifies capabilities, models, and sessions without exposing config', async () => {
  const seenAuth = [];
  await withHermesServer((req, res) => {
    seenAuth.push(req.headers.authorization);
    if (req.url === '/v1/capabilities') return json(res, 200, {session_chat: true, session_messages: true});
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'profile-main'}]});
    if (req.url === '/api/sessions?limit=1&offset=0') return json(res, 200, {object: 'list', data: []});
    return json(res, 404, {error: 'not found'});
  }, async () => {
    const result = await getHermesStatus();
    assert.equal(result.connected, true);
    assert.equal(result.model, 'profile-main');
    assert.equal(result.sessions_api, true);
    assert.deepEqual(result.capabilities, {session_chat: true, session_messages: true});
    assert.deepEqual(seenAuth, [
      'Bearer test-secret-key',
      'Bearer test-secret-key',
      'Bearer test-secret-key',
    ]);
    assert.equal(JSON.stringify(result).includes('test-secret-key'), false);
    assert.equal(JSON.stringify(result).includes(process.env.HERMES_BASE_URL), false);
  });
});

test('legacy chat still discovers advertised model and returns assistant text', async () => {
  let chatBody;
  await withHermesServer((req, res) => {
    if (req.headers.authorization !== 'Bearer test-secret-key') return json(res, 401, {error: 'bad auth'});
    if (req.url === '/v1/models') return json(res, 200, {data: [{id: 'profile-main'}]});
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      readJson(req).then((body) => {
        chatBody = body;
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

test('session adapter creates a real Hermes session with bounded client-safe fields', async () => {
  let body;
  await withHermesServer((req, res) => {
    if (req.url === '/api/sessions' && req.method === 'POST') {
      readJson(req).then((value) => {
        body = value;
        json(res, 201, {
          object: 'hermes.session',
          session: {id: 'api_123_abcd', source: 'api_server', title: 'M2 proof'},
        });
      });
      return;
    }
    return json(res, 404, {});
  }, async () => {
    const result = await createHermesSession({title: 'M2 proof'});
    assert.deepEqual(result, {session_id: 'api_123_abcd', title: 'M2 proof'});
    assert.deepEqual(body, {source: 'chatgpt_plugin', title: 'M2 proof'});
  });
});

test('session turn uses the stable session id and returns only sanitized runtime metadata', async () => {
  let body;
  await withHermesServer((req, res) => {
    if (req.url === '/api/sessions/api_123_abcd/chat' && req.method === 'POST') {
      readJson(req).then((value) => {
        body = value;
        json(res, 200, {
          object: 'hermes.session.chat.completion',
          session_id: 'api_123_abcd',
          message: {role: 'assistant', content: '391'},
          runtime: {model: 'model-x', provider: 'provider-y', private_field: 'ignore-me'},
        });
      });
      return;
    }
    return json(res, 404, {});
  }, async () => {
    const result = await sendHermesSessionMessage('api_123_abcd', 'What is 17 × 23?');
    assert.deepEqual(body, {input: 'What is 17 × 23?'});
    assert.deepEqual(result, {
      session_id: 'api_123_abcd',
      message: '391',
      truncated: false,
      model: 'model-x',
      provider: 'provider-y',
    });
    assert.equal(JSON.stringify(result).includes('private_field'), false);
  });
});

test('session inspection extracts tool names without exposing tool arguments or outputs', async () => {
  await withHermesServer((req, res) => {
    if (req.url === '/api/sessions/api_123_abcd') {
      return json(res, 200, {
        object: 'hermes.session',
        session: {
          id: 'api_123_abcd', title: 'M2 proof', model: 'model-x',
          message_count: 4, tool_call_count: 2,
        },
      });
    }
    if (req.url === '/api/sessions/api_123_abcd/messages?limit=200&offset=0&order=latest') {
      return json(res, 200, {
        object: 'list',
        data: [
          {role: 'user', content: 'use a tool'},
          {role: 'assistant', content: '', tool_calls: [
            {function: {name: 'web_search', arguments: '{"q":"secret-looking-input"}'}}
          ]},
          {role: 'tool', tool_name: 'web_search', content: 'sensitive raw tool output'},
          {role: 'assistant', content: 'Verified answer'},
        ],
      });
    }
    return json(res, 404, {});
  }, async () => {
    const result = await getHermesSession('api_123_abcd');
    assert.deepEqual(result, {
      session_id: 'api_123_abcd',
      title: 'M2 proof',
      model: 'model-x',
      message_count: 4,
      tool_call_count: 2,
      tool_names: ['web_search'],
      last_assistant_message: 'Verified answer',
    });
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('secret-looking-input'), false);
    assert.equal(serialized.includes('sensitive raw tool output'), false);
  });
});

test('invalid session identifiers are rejected before any upstream request', async () => {
  let requestCount = 0;
  await withHermesServer((req, res) => {
    requestCount += 1;
    json(res, 500, {});
  }, async () => {
    await assert.rejects(() => getHermesSession('../etc/passwd'), /Session identifier is invalid/);
    assert.equal(requestCount, 0);
  });
});

test('upstream auth errors and network details redact credentials and origin', async () => {
  await withHermesServer((req, res) => {
    return json(res, 401, {error: `credential test-secret-key rejected at ${process.env.HERMES_BASE_URL}`});
  }, async ({baseUrl}) => {
    await assert.rejects(() => createHermesSession(), (err) => {
      assert.equal(String(err.message).includes('test-secret-key'), false);
      assert.equal(String(err.message).includes(baseUrl), false);
      assert.match(err.message, /HTTP 401/);
      return true;
    });
  });
});

test('malformed upstream JSON is converted to a clean error', async () => {
  await withHermesServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/plain'});
    res.end('<html>not json</html>');
  }, async () => {
    await assert.rejects(() => createHermesSession(), /malformed JSON/);
  });
});

test('timeout handling is explicit and does not emit a stack or config', async () => {
  await withHermesServer((req, res) => {
    void req;
    void res;
  }, async ({baseUrl}) => {
    await assert.rejects(() => createHermesSession(), (err) => {
      assert.match(err.message, /timed out/i);
      assert.equal(err.message.includes(baseUrl), false);
      assert.equal(/stack|process\.env|HERMES_API_KEY/i.test(err.message), false);
      return true;
    });
  }, {timeoutMs: 50});
});

test('missing server configuration is explicit and secret-free', async () => {
  const oldBase = process.env.HERMES_BASE_URL;
  const oldKey = process.env.HERMES_API_KEY;
  delete process.env.HERMES_BASE_URL;
  delete process.env.HERMES_API_KEY;
  try {
    await assert.rejects(() => getHermesStatus(), /not configured on the server/);
  } finally {
    if (oldBase !== undefined) process.env.HERMES_BASE_URL = oldBase;
    if (oldKey !== undefined) process.env.HERMES_API_KEY = oldKey;
  }
});
