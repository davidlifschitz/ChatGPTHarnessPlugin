const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MemoryStateStore,
  getStateStore,
  setBlobSdkForTests,
  setStateStoreForTests,
} = require('../../lib/state-store');

function createFakeBlobSdk() {
  const blobs = new Map();
  const calls = [];
  let revision = 0;

  function httpConflict(statusCode) {
    const error = new Error('conditional write rejected');
    error.statusCode = statusCode;
    return error;
  }

  return {
    calls,
    blobs,
    sdk: {
      async get(path, options) {
        calls.push({ operation: 'get', path, options });
        const stored = blobs.get(path);
        if (!stored) return null;
        return {
          headers: new Headers({ etag: stored.version }),
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(Buffer.from(stored.body));
              controller.close();
            },
          }),
        };
      },
      async put(path, body, options) {
        calls.push({ operation: 'put', path, options });
        const current = blobs.get(path);
        if (options.ifMatch !== undefined
          && (!current || options.ifMatch !== current.version)) {
          throw httpConflict(412);
        }
        if (options.allowOverwrite === false && current) {
          throw httpConflict(409);
        }
        revision += 1;
        const etag = `etag-${revision}`;
        blobs.set(path, { body: String(body), version: etag });
        return { etag };
      },
      async del(path, options) {
        calls.push({ operation: 'del', path, options });
        blobs.delete(path);
      },
    },
  };
}

test('memory state store creates and replaces records with versioned compare-and-swap', async () => {
  const store = new MemoryStateStore();
  const path = 'mcp-oauth/states/state123';

  assert.equal(await store.readVersionedJson(path), null);
  assert.equal(await store.compareAndSwapJson(path, null, { status: 'pending', claims: ['operator'] }), true);

  const first = await store.readVersionedJson(path);
  assert.deepEqual(first.value, { status: 'pending', claims: ['operator'] });
  assert.equal(typeof first.version, 'string');

  first.value.claims.push('mutated outside store');
  assert.deepEqual((await store.readVersionedJson(path)).value, {
    status: 'pending',
    claims: ['operator'],
  });

  assert.equal(await store.compareAndSwapJson(path, null, { status: 'duplicate' }), false);
  assert.equal(await store.compareAndSwapJson(path, 'stale-version', { status: 'stale-write' }), false);
  assert.equal(await store.compareAndSwapJson(path, first.version, { status: 'consumed' }), true);

  const second = await store.readVersionedJson(path);
  assert.deepEqual(second.value, { status: 'consumed' });
  assert.notEqual(second.version, first.version);
  assert.equal(await store.compareAndSwapJson(path, first.version, { status: 'stale-write' }), false);

  await store.writeJson(path, { status: 'written' });
  const third = await store.readVersionedJson(path);
  assert.deepEqual(third.value, { status: 'written' });
  assert.notEqual(third.version, second.version);
});

test('Blob state store reads private uncached ETags and permits one competing CAS writer', async (t) => {
  const fake = createFakeBlobSdk();
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  const path = 'mcp-oauth/states/state456';
  assert.equal(await store.compareAndSwapJson(path, null, { state: 'pending' }), true);

  const first = await store.readVersionedJson(path);
  assert.deepEqual(first.value, { state: 'pending' });
  assert.equal(typeof first.version, 'string');
  const firstGet = fake.calls.find((call) => call.operation === 'get');
  assert.equal(firstGet.options.access, 'private');
  assert.equal(firstGet.options.useCache, false);
  assert.ok(firstGet.options.abortSignal instanceof AbortSignal);

  const results = await Promise.all([
    store.compareAndSwapJson(path, first.version, { state: 'consumed' }),
    store.compareAndSwapJson(path, first.version, { state: 'duplicate' }),
  ]);
  assert.deepEqual(results.sort(), [false, true]);

  const latest = await store.readVersionedJson(path);
  assert.notEqual(latest.version, first.version);
  assert.ok(['consumed', 'duplicate'].includes(latest.value.state));
  assert.deepEqual(await store.readJson(path), latest.value);

  const puts = fake.calls.filter((call) => call.operation === 'put');
  assert.ok(puts.every((call) => call.options.access === 'private'));
  assert.ok(puts.every((call) => call.options.addRandomSuffix === false));
  assert.ok(puts.every((call) => call.options.abortSignal instanceof AbortSignal));
  assert.equal(puts[0].options.allowOverwrite, false);
  assert.ok(puts.slice(1).every((call) => call.options.ifMatch === first.version));
});

test('Blob state store accepts the SDK get result blob.etag metadata shape', async (t) => {
  const fake = createFakeBlobSdk();
  const path = 'mcp-oauth/states/sdk-etag-shape';
  const etag = 'sdk-blob-etag';
  fake.blobs.set(path, { body: JSON.stringify({ state: 'pending' }), version: etag });
  fake.sdk.get = async () => ({
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from(JSON.stringify({ state: 'pending' })));
        controller.close();
      },
    }),
    blob: { etag },
  });
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  const record = await store.readVersionedJson(path);
  assert.deepEqual(record, { value: { state: 'pending' }, version: etag });
  assert.equal(await store.compareAndSwapJson(path, etag, { state: 'consumed' }), true);
});

test('state paths reject traversal, absolute paths, oversized hierarchies, and unusual characters', async (t) => {
  const fake = createFakeBlobSdk();
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const memory = new MemoryStateStore();
  const blob = getStateStore();
  const invalidPaths = [
    '../outside',
    'mcp-oauth/../outside',
    '/absolute/path',
    'mcp-oauth//state',
    'mcp-oauth/%2e%2e/state',
    'mcp-oauth/state name',
    'mcp-oauth/state\\name',
    'mcp-oauth:state',
    'm2/hermes/credentials..json',
    'm2/hermes/credentials.JSON',
    'm2/hermes/credentials.json.backup',
    'm2/hermes/credentials.json/extra',
    'm2/hermes/credentials.json/a.json',
    'a.json/a.json',
    'a/b/c/d/e',
    `mcp-oauth/${'a'.repeat(193)}`,
  ];

  for (const path of invalidPaths) {
    await assert.rejects(memory.readVersionedJson(path), /State path is invalid/);
    await assert.rejects(memory.compareAndSwapJson(path, null, {}), /State path is invalid/);
    await assert.rejects(blob.readVersionedJson(path), /State path is invalid/);
  }
  assert.equal(fake.calls.length, 0);

  const credentialsPath = 'm2/hermes/credentials.json';
  assert.equal(await memory.readVersionedJson(credentialsPath), null);
  assert.equal(await blob.readVersionedJson(credentialsPath), null);
  assert.deepEqual(fake.calls.map((call) => call.path), [credentialsPath]);
});

test('empty stored state is rejected while serialized JSON null round-trips', async (t) => {
  const fake = createFakeBlobSdk();
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  assert.equal(await store.readVersionedJson('mcp-oauth/state/missing'), null);

  const emptyPath = 'mcp-oauth/state/empty';
  fake.blobs.set(emptyPath, { body: '', version: 'etag-empty' });
  await assert.rejects(store.readVersionedJson(emptyPath), /Stored state is not valid JSON/);

  const nullPath = 'mcp-oauth/state/null-value';
  await store.writeJson(nullPath, null);
  const nullRecord = await store.readVersionedJson(nullPath);
  assert.deepEqual(nullRecord.value, null);
  assert.equal(typeof nullRecord.version, 'string');
});

test('stored state rejects invalid UTF-8 and decodes split multibyte characters', async (t) => {
  const fake = createFakeBlobSdk();
  const records = new Map();
  const response = (etag, stream) => ({ headers: new Headers({ etag }), stream });
  const webStream = (chunks) => new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  });
  const iteratorStream = (chunks) => ({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Uint8Array.from(chunk);
    },
  });
  fake.sdk.get = async (path) => records.get(path) || null;

  const invalidJson = Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  const invalidPath = 'mcp-oauth/state/invalid-utf8-web';
  records.set(invalidPath, response('etag-invalid-web', webStream([invalidJson])));

  const invalidIteratorPath = 'mcp-oauth/state/invalid-utf8-iterator';
  records.set(invalidIteratorPath, response('etag-invalid-iterator', iteratorStream([
    invalidJson.slice(0, 6),
    invalidJson.slice(6, 7),
    invalidJson.slice(7),
  ])));

  const splitJson = [
    Buffer.from('{"text":"'),
    Uint8Array.from([0xe2]),
    Uint8Array.from([0x82, 0xac]),
    Buffer.from('"}'),
  ];
  const validWebPath = 'mcp-oauth/state/valid-split-utf8-web';
  records.set(validWebPath, response('etag-valid-web', webStream(splitJson)));

  const validIteratorPath = 'mcp-oauth/state/valid-split-utf8-iterator';
  records.set(validIteratorPath, response('etag-valid-iterator', iteratorStream(splitJson)));

  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  await assert.rejects(store.readVersionedJson(invalidPath), /Stored state encoding is invalid/);
  await assert.rejects(store.readVersionedJson(invalidIteratorPath), /Stored state encoding is invalid/);
  assert.deepEqual((await store.readVersionedJson(validWebPath)).value, { text: '€' });
  assert.deepEqual((await store.readVersionedJson(validIteratorPath)).value, { text: '€' });
});

test('state JSON writes and streamed reads enforce the 128 KiB bound', async (t) => {
  const fake = createFakeBlobSdk();
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const memory = new MemoryStateStore();
  const blob = getStateStore();
  const maxBytes = 128 * 1024;
  const exactLimit = { payload: 'a'.repeat(maxBytes - Buffer.byteLength('{"payload":""}')) };
  assert.equal(Buffer.byteLength(JSON.stringify(exactLimit)), maxBytes);
  await memory.writeJson('mcp-oauth/state/exact-limit', exactLimit);
  assert.deepEqual(await memory.readJson('mcp-oauth/state/exact-limit'), exactLimit);

  const oversized = { payload: 'a'.repeat(maxBytes) };
  await assert.rejects(memory.writeJson('mcp-oauth/state/too-large', oversized), /maximum size/);
  await assert.rejects(blob.writeJson('mcp-oauth/state/too-large', oversized), /maximum size/);
  assert.equal(fake.calls.length, 0);

  const path = 'mcp-oauth/state/oversized-record';
  fake.blobs.set(path, {
    body: JSON.stringify(oversized),
    version: 'etag-large',
  });
  await assert.rejects(blob.readVersionedJson(path), /maximum size/);
});

test('oversized stream chunks cancel before the store reads subsequent chunks', async (t) => {
  const fake = createFakeBlobSdk();
  let reads = 0;
  let cancelled = false;
  fake.sdk.get = async () => ({
    headers: new Headers({ etag: 'etag-too-large' }),
    stream: {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads === 1) return { done: false, value: new Uint8Array(128 * 1024 + 1) };
            return { done: false, value: new Uint8Array([0x7b]) };
          },
          async cancel() {
            cancelled = true;
          },
          releaseLock() {},
        };
      },
    },
  });

  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  await assert.rejects(
    getStateStore().readVersionedJson('mcp-oauth/state/large-chunk'),
    /maximum size/,
  );
  assert.equal(reads, 1);
  assert.equal(cancelled, true);
});

test('invalid stream chunks cancel the reader before rejecting', async (t) => {
  const fake = createFakeBlobSdk();
  let reads = 0;
  let cancelled = false;
  fake.sdk.get = async () => ({
    headers: new Headers({ etag: 'etag-invalid-chunk' }),
    stream: {
      getReader() {
        return {
          async read() {
            reads += 1;
            return { done: false, value: { invalid: true } };
          },
          async cancel() {
            cancelled = true;
          },
          releaseLock() {},
        };
      },
    },
  });

  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  await assert.rejects(
    getStateStore().readVersionedJson('mcp-oauth/state/invalid-chunk'),
    /invalid chunk/,
  );
  assert.equal(reads, 1);
  assert.equal(cancelled, true);
});

test('Blob read deadline aborts a stalled stream within ten seconds', async (t) => {
  const fake = createFakeBlobSdk();
  let receivedSignal;
  let cancelled = false;
  let streamReadStarted;
  const readStarted = new Promise((resolve) => {
    streamReadStarted = resolve;
  });
  fake.sdk.get = async (_path, options) => {
    receivedSignal = options.abortSignal;
    return {
      headers: new Headers({ etag: 'etag-stalled' }),
      stream: {
        getReader() {
          return {
            read() {
              streamReadStarted();
              return new Promise(() => {});
            },
            cancel() {
              cancelled = true;
              return Promise.resolve();
            },
            releaseLock() {},
          };
        },
      },
    };
  };

  setStateStoreForTests(null);
  assert.throws(
    () => setBlobSdkForTests(fake.sdk, { timeoutMs: 10_001 }),
    /State store test timeout is invalid/,
  );
  setBlobSdkForTests(fake.sdk, { timeoutMs: 25 });
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const pending = getStateStore().readVersionedJson('mcp-oauth/state/stalled');
  await readStarted;
  assert.ok(receivedSignal instanceof AbortSignal);

  await assert.rejects(pending, /State store operation timed out/);
  assert.equal(receivedSignal.aborted, true);
  assert.equal(cancelled, true);
});

test('Blob delete deadline passes its abort signal to the SDK', async (t) => {
  const fake = createFakeBlobSdk();
  let receivedSignal;
  fake.sdk.del = async (_path, options) => {
    receivedSignal = options.abortSignal;
    return new Promise(() => {});
  };

  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk, { timeoutMs: 25 });
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  await assert.rejects(
    getStateStore().delete('mcp-oauth/state/to-delete'),
    /State store operation timed out/,
  );
  assert.ok(receivedSignal instanceof AbortSignal);
  assert.equal(receivedSignal.aborted, true);
});

test('actual Blob SDK precondition errors return false for conditional and create-only writes', async (t) => {
  const { BlobPreconditionFailedError } = await import('@vercel/blob');
  assert.equal(typeof BlobPreconditionFailedError, 'function');
  const sdkError = new BlobPreconditionFailedError();
  assert.equal(sdkError.name, 'Error');
  assert.equal(sdkError.status, undefined);
  assert.equal(sdkError.statusCode, undefined);

  const fake = createFakeBlobSdk();
  const writes = [];
  fake.sdk.BlobPreconditionFailedError = BlobPreconditionFailedError;
  fake.sdk.put = async (_path, _body, options) => {
    writes.push(options);
    throw new BlobPreconditionFailedError();
  };
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  assert.equal(await store.compareAndSwapJson('mcp-oauth/state/conditional', 'etag-current', {}), false);
  assert.equal(await store.compareAndSwapJson('mcp-oauth/state/create-only-cas', null, {}), false);
  assert.equal(await store.createJson('mcp-oauth/state/create-only', {}), false);
  assert.equal(writes.length, 3);
  assert.equal(writes[0].ifMatch, 'etag-current');
  assert.equal(writes[1].allowOverwrite, false);
  assert.equal(writes[2].allowOverwrite, false);
});

test('Blob SDK create errors return false only after an uncached versioned reread finds an existing row', async (t) => {
  const { BlobError } = await import('@vercel/blob');
  assert.equal(typeof BlobError, 'function');
  const fake = createFakeBlobSdk();
  const existingPath = 'mcp-oauth/state/already-created';
  const existingValue = { state: 'pending' };
  const existingVersion = 'etag-original';
  fake.blobs.set(existingPath, {
    body: JSON.stringify(existingValue),
    version: existingVersion,
  });
  fake.sdk.BlobError = BlobError;
  let errorToThrow = new BlobError('provider rejected create-only put');
  fake.sdk.put = async () => {
    throw errorToThrow;
  };
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  const store = getStateStore();
  assert.equal(await store.createJson(existingPath, { state: 'replacement' }), false);
  const unchanged = await store.readVersionedJson(existingPath);
  assert.deepEqual(unchanged.value, existingValue);
  assert.equal(unchanged.version, existingVersion);
  const confirmationRead = fake.calls.find((call) => (
    call.operation === 'get' && call.path === existingPath
  ));
  assert.equal(confirmationRead.options.useCache, false);

  assert.equal(await store.compareAndSwapJson(existingPath, null, { state: 'replacement' }), false);
  const unchangedAfterCas = await store.readVersionedJson(existingPath);
  assert.deepEqual(unchangedAfterCas.value, existingValue);
  assert.equal(unchangedAfterCas.version, existingVersion);

  const missingPath = 'mcp-oauth/state/create-provider-error';
  const providerError = new BlobError('provider rejected fresh create');
  errorToThrow = providerError;
  await assert.rejects(
    store.compareAndSwapJson(missingPath, null, { state: 'pending' }),
    (error) => error === providerError,
  );
  assert.equal(fake.blobs.has(missingPath), false);

  const unreadablePath = 'mcp-oauth/state/unreadable-existing-row';
  fake.blobs.set(unreadablePath, { body: '{invalid', version: 'etag-unreadable' });
  await assert.rejects(
    store.compareAndSwapJson(unreadablePath, null, { state: 'pending' }),
    (error) => error === providerError,
  );

  const spoofPath = 'mcp-oauth/state/spoofed-sdk-error';
  fake.blobs.set(spoofPath, {
    body: JSON.stringify(existingValue),
    version: existingVersion,
  });
  const spoofError = Object.assign(new Error('spoofed SDK error'), { name: 'BlobError' });
  errorToThrow = spoofError;
  const readsBeforeSpoof = fake.calls.filter((call) => (
    call.operation === 'get' && call.path === spoofPath
  )).length;
  await assert.rejects(
    store.compareAndSwapJson(spoofPath, null, { state: 'replacement' }),
    (error) => error === spoofError,
  );
  const readsAfterSpoof = fake.calls.filter((call) => (
    call.operation === 'get' && call.path === spoofPath
  )).length;
  assert.equal(readsAfterSpoof, readsBeforeSpoof);
});

test('CAS does not convert generic error text into a version conflict', async (t) => {
  const fake = createFakeBlobSdk();
  let errorToThrow = new Error('upstream reported a conflict while storing state');
  fake.sdk.put = async (_path, _body, options) => {
    assert.equal(options.ifMatch, 'etag-current');
    throw errorToThrow;
  };
  setStateStoreForTests(null);
  setBlobSdkForTests(fake.sdk);
  t.after(() => {
    setStateStoreForTests(null);
    setBlobSdkForTests(null);
  });

  await assert.rejects(
    getStateStore().compareAndSwapJson('mcp-oauth/state/current', 'etag-current', { state: 'next' }),
    /upstream reported a conflict/,
  );

  errorToThrow = Object.assign(new Error('not an SDK error'), {
    name: 'BlobPreconditionFailedError',
  });
  await assert.rejects(
    getStateStore().compareAndSwapJson('mcp-oauth/state/current', 'etag-current', { state: 'next' }),
    /not an SDK error/,
  );
});
