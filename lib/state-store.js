'use strict';

const { TextDecoder } = require('node:util');

let storeOverride = null;
let blobSdkPromise = null;
let blobSdkOverride = null;
let blobSdkTimeoutOverrideForTests = null;

const MAX_STATE_PATH_LENGTH = 192;
const MAX_STATE_PATH_DEPTH = 4;
const MAX_STATE_SEGMENT_LENGTH = 64;
const MAX_JSON_BYTES = 128 * 1024;
const MAX_VERSION_LENGTH = 512;
const STORE_OPERATION_TIMEOUT_MS = 10_000;

function validateStatePath(path) {
  if (typeof path !== 'string' || path.length > MAX_STATE_PATH_LENGTH) {
    throw new TypeError('State path is invalid.');
  }
  const segments = path.split('/');
  if (segments.length < 1 || segments.length > MAX_STATE_PATH_DEPTH
    || segments.some((segment, index) => segment.length > MAX_STATE_SEGMENT_LENGTH
      || !(index === segments.length - 1
        ? /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.json)?$/.test(segment)
        : /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(segment)))) {
    throw new TypeError('State path is invalid.');
  }
  return path;
}

function serializeJson(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError('State value must be JSON serializable.');
  }
  if (typeof serialized !== 'string') {
    throw new TypeError('State value must be JSON serializable.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_JSON_BYTES) {
    throw new RangeError('State value exceeds the maximum size.');
  }
  return serialized;
}

function validateVersion(version) {
  if (version !== null && (typeof version !== 'string' || !version
    || version.length > MAX_VERSION_LENGTH || /[\r\n]/.test(version))) {
    throw new TypeError('State version is invalid.');
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

class MemoryStateStore {
  constructor() {
    this.values = new Map();
    this.versions = new Map();
    this.revision = 0;
  }

  nextVersion() {
    this.revision += 1;
    return String(this.revision);
  }

  async readJson(path) {
    validateStatePath(path);
    return this.values.has(path) ? clone(this.values.get(path)) : null;
  }

  async readVersionedJson(path) {
    validateStatePath(path);
    if (!this.values.has(path)) return null;
    return {
      value: clone(this.values.get(path)),
      version: this.versions.get(path),
    };
  }

  async writeJson(path, value) {
    validateStatePath(path);
    const serialized = serializeJson(value);
    this.values.set(path, JSON.parse(serialized));
    this.versions.set(path, this.nextVersion());
  }

  async createJson(path, value) {
    validateStatePath(path);
    if (this.values.has(path)) return false;
    const serialized = serializeJson(value);
    this.values.set(path, JSON.parse(serialized));
    this.versions.set(path, this.nextVersion());
    return true;
  }

  async compareAndSwapJson(path, version, value) {
    validateStatePath(path);
    validateVersion(version);
    const serialized = serializeJson(value);
    if (version === null) {
      if (this.values.has(path)) return false;
    } else if (!this.values.has(path) || this.versions.get(path) !== version) {
      return false;
    }
    this.values.set(path, JSON.parse(serialized));
    this.versions.set(path, this.nextVersion());
    return true;
  }

  async delete(path) {
    validateStatePath(path);
    this.values.delete(path);
    this.versions.delete(path);
  }
}

async function loadBlobSdk() {
  if (blobSdkOverride) return blobSdkOverride;
  if (!blobSdkPromise) blobSdkPromise = import('@vercel/blob');
  return blobSdkPromise;
}

function withOperationTimeout(operation) {
  const controller = new AbortController();
  const timeoutMs = blobSdkTimeoutOverrideForTests ?? STORE_OPERATION_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('State store operation timed out.'));
    }, timeoutMs);
  });
  const work = Promise.resolve().then(() => operation(controller.signal));
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function isBlobPreconditionFailure(error, sdk) {
  const ErrorClass = sdk?.BlobPreconditionFailedError;
  if (typeof ErrorClass !== 'function') return false;
  try {
    return error instanceof ErrorClass;
  } catch {
    return false;
  }
}

function isBlobSdkError(error, sdk) {
  const ErrorClass = sdk?.BlobError;
  if (typeof ErrorClass !== 'function') return false;
  try {
    return error instanceof ErrorClass;
  } catch {
    return false;
  }
}

function hasHttpStatus(error, ...statuses) {
  const status = error?.status ?? error?.statusCode;
  return statuses.includes(status);
}

function isCreateConflict(error, sdk) {
  return isBlobPreconditionFailure(error, sdk) || hasHttpStatus(error, 409, 412);
}

function isVersionConflict(error, sdk) {
  return isBlobPreconditionFailure(error, sdk) || hasHttpStatus(error, 412);
}

function etagFrom(result) {
  const headerValue = result?.headers && typeof result.headers.get === 'function'
    ? result.headers.get('etag')
    : null;
  const version = headerValue || result?.blob?.etag || result?.etag;
  if (typeof version !== 'string' || !version || version.length > MAX_VERSION_LENGTH
    || /[\r\n]/.test(version)) {
    return null;
  }
  return version;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Stored state is not valid JSON.');
  }
}

function appendChunk(chunks, chunk, totalBytes) {
  let chunkBytes;
  if (typeof chunk === 'string') {
    chunkBytes = Buffer.byteLength(chunk, 'utf8');
  } else if (Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk) || chunk instanceof ArrayBuffer) {
    chunkBytes = chunk.byteLength;
  } else {
    throw new TypeError('Stored state stream contains an invalid chunk.');
  }
  const nextTotal = totalBytes + chunkBytes;
  if (nextTotal > MAX_JSON_BYTES) {
    throw new RangeError('Stored state exceeds the maximum size.');
  }
  const buffer = Buffer.isBuffer(chunk)
    ? chunk
    : typeof chunk === 'string'
      ? Buffer.from(chunk, 'utf8')
      : ArrayBuffer.isView(chunk)
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : Buffer.from(chunk);
  chunks.push(buffer);
  return nextTotal;
}

function decodeStateUtf8(chunks, totalBytes) {
  const bytes = Buffer.concat(chunks, totalBytes);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Stored state encoding is invalid.');
  }
}

async function streamToText(stream, signal) {
  if (!stream) return '';
  const chunks = [];
  let totalBytes = 0;

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    const cancelOnAbort = () => {
      Promise.resolve(reader.cancel()).catch(() => {});
    };
    signal.addEventListener('abort', cancelOnAbort, { once: true });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes = appendChunk(chunks, value, totalBytes);
      }
    } catch (error) {
      try {
        Promise.resolve(reader.cancel(error)).catch(() => {});
      } catch {
        // Preserve the bounded-read error if the stream cannot be cancelled.
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', cancelOnAbort);
      try {
        reader.releaseLock();
      } catch {
        // The stream may still be closing after cancellation.
      }
    }
    return decodeStateUtf8(chunks, totalBytes);
  }

  if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    const iterator = stream[Symbol.asyncIterator]();
    const cancelOnAbort = () => {
      if (typeof stream.destroy === 'function') stream.destroy();
      if (typeof iterator.return === 'function') {
        Promise.resolve(iterator.return()).catch(() => {});
      }
    };
    signal.addEventListener('abort', cancelOnAbort, { once: true });
    try {
      while (true) {
        const result = await iterator.next();
        if (result.done) break;
        totalBytes = appendChunk(chunks, result.value, totalBytes);
      }
    } catch (error) {
      try {
        if (typeof stream.destroy === 'function') stream.destroy();
      } catch {
        // Preserve the bounded-read error if the stream cannot be destroyed.
      }
      try {
        if (typeof iterator.return === 'function') {
          Promise.resolve(iterator.return()).catch(() => {});
        }
      } catch {
        // Preserve the bounded-read error if the iterator cannot be closed.
      }
      throw error;
    } finally {
      signal.removeEventListener('abort', cancelOnAbort);
    }
    return decodeStateUtf8(chunks, totalBytes);
  }

  throw new TypeError('Stored state stream is invalid.');
}

async function readBlobJson(path, requireVersion) {
  return withOperationTimeout(async (abortSignal) => {
    const { get } = await loadBlobSdk();
    const result = await get(path, {
      access: 'private',
      useCache: false,
      abortSignal,
    });
    if (!result) return null;
    const text = await streamToText(result.stream, abortSignal);
    const value = parseJson(text);
    const version = etagFrom(result);
    if (requireVersion && !version) {
      throw new Error('State record version is unavailable.');
    }
    return { value, version };
  });
}

const blobStore = {
  async readJson(path) {
    validateStatePath(path);
    const record = await readBlobJson(path, false);
    return record ? record.value : null;
  },

  async readVersionedJson(path) {
    validateStatePath(path);
    const record = await readBlobJson(path, true);
    return record ? { value: record.value, version: record.version } : null;
  },

  async writeJson(path, value) {
    validateStatePath(path);
    const serialized = serializeJson(value);
    await withOperationTimeout(async (abortSignal) => {
      const { put } = await loadBlobSdk();
      await put(path, serialized, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        abortSignal,
      });
    });
  },

  async createJson(path, value) {
    validateStatePath(path);
    const serialized = serializeJson(value);
    let sdk;
    try {
      await withOperationTimeout(async (abortSignal) => {
        sdk = await loadBlobSdk();
        const { put } = sdk;
        await put(path, serialized, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: 'application/json',
          abortSignal,
        });
      });
      return true;
    } catch (error) {
      if (isCreateConflict(error, sdk)) return false;
      if (isBlobSdkError(error, sdk)) {
        try {
          if (await readBlobJson(path, true)) return false;
        } catch {
          // Preserve the original write error when the confirmation read fails.
        }
      }
      throw error;
    }
  },

  async compareAndSwapJson(path, version, value) {
    validateStatePath(path);
    validateVersion(version);
    if (version === null) return blobStore.createJson(path, value);
    const serialized = serializeJson(value);
    let sdk;
    try {
      await withOperationTimeout(async (abortSignal) => {
        sdk = await loadBlobSdk();
        const { put } = sdk;
        await put(path, serialized, {
          access: 'private',
          addRandomSuffix: false,
          allowOverwrite: version !== null,
          ...(version === null ? {} : { ifMatch: version }),
          contentType: 'application/json',
          abortSignal,
        });
      });
      return true;
    } catch (error) {
      if (version === null && isCreateConflict(error, sdk)) return false;
      if (version !== null && isVersionConflict(error, sdk)) return false;
      throw error;
    }
  },

  async delete(path) {
    validateStatePath(path);
    await withOperationTimeout(async (abortSignal) => {
      const { del } = await loadBlobSdk();
      await del(path, { abortSignal });
    });
  },
};

function getStateStore() {
  return storeOverride || blobStore;
}

function setStateStoreForTests(store) {
  storeOverride = store || null;
}

function setBlobSdkForTests(sdk, options = {}) {
  const timeoutMs = options.timeoutMs;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > STORE_OPERATION_TIMEOUT_MS)) {
    throw new TypeError('State store test timeout is invalid.');
  }
  blobSdkOverride = sdk || null;
  blobSdkTimeoutOverrideForTests = sdk ? (timeoutMs ?? null) : null;
}

module.exports = {
  MemoryStateStore,
  getStateStore,
  setBlobSdkForTests,
  setStateStoreForTests,
};
