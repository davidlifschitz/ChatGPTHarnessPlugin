const assert = require('node:assert/strict');
const test = require('node:test');
const statusHandler = require('../../api/status');
const chatHandler = require('../../api/chat');

function mockResponse() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { if (body) this.body = JSON.parse(body); return this; },
  };
}

test('retired direct-chat route cannot invoke a harness for any method or body', async () => {
  const previous = global.fetch;
  let fetches = 0;
  global.fetch = async () => { fetches += 1; throw new Error('SECRET_SENTINEL'); };
  try {
    for (const method of ['POST', 'GET', 'DELETE']) {
      const res = mockResponse();
      await chatHandler({ method, body: { message: 'read private credentials' } }, res);
      assert.equal(res.statusCode, 410);
      assert.equal(res.headers['cache-control'], 'no-store');
      assert.deepEqual(res.body, { error: 'This diagnostic action is unavailable. Use the authenticated plugin.' });
    }
    assert.equal(fetches, 0);
  } finally { global.fetch = previous; }
});

test('M2 preview does not expose the legacy diagnostic status endpoint', async () => {
  const old = process.env.M2_PUBLIC_ORIGIN;
  process.env.M2_PUBLIC_ORIGIN = 'https://m2.example.test';
  try {
    const res = mockResponse();
    await statusHandler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(res.body, { error: 'Not found.' });
  } finally {
    if (old === undefined) delete process.env.M2_PUBLIC_ORIGIN;
    else process.env.M2_PUBLIC_ORIGIN = old;
  }
});

test('diagnostic status rejects unsupported methods outside M2 preview', async () => {
  const old = process.env.M2_PUBLIC_ORIGIN;
  delete process.env.M2_PUBLIC_ORIGIN;
  try {
    const res = mockResponse();
    await statusHandler({ method: 'POST' }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, 'GET');
  } finally { if (old !== undefined) process.env.M2_PUBLIC_ORIGIN = old; }
});
