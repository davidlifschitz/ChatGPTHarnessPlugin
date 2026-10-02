'use strict';

let storeOverride = null;
let blobSdkPromise = null;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

class MemoryStateStore {
  constructor() {
    this.values = new Map();
  }

  async readJson(path) {
    return clone(this.values.get(path) ?? null);
  }

  async writeJson(path, value) {
    this.values.set(path, clone(value));
  }

  async createJson(path, value) {
    if (this.values.has(path)) return false;
    this.values.set(path, clone(value));
    return true;
  }

  async delete(path) {
    this.values.delete(path);
  }
}

async function loadBlobSdk() {
  if (!blobSdkPromise) blobSdkPromise = import('@vercel/blob');
  return blobSdkPromise;
}

async function streamToText(stream) {
  if (!stream) return '';
  if (typeof stream.getReader === 'function') {
    return new Response(stream).text();
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function isConflict(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');
  return status === 409 || /already exists|conflict|allowOverwrite/i.test(message);
}

const blobStore = {
  async readJson(path) {
    const { get } = await loadBlobSdk();
    const result = await get(path, { access: 'private', useCache: false });
    if (!result) return null;
    const text = await streamToText(result.stream);
    return text ? JSON.parse(text) : null;
  },

  async writeJson(path, value) {
    const { put } = await loadBlobSdk();
    await put(path, JSON.stringify(value), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
  },

  async createJson(path, value) {
    const { put } = await loadBlobSdk();
    try {
      await put(path, JSON.stringify(value), {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
      });
      return true;
    } catch (error) {
      if (isConflict(error)) return false;
      throw error;
    }
  },

  async delete(path) {
    const { del } = await loadBlobSdk();
    await del(path);
  },
};

function getStateStore() {
  return storeOverride || blobStore;
}

function setStateStoreForTests(store) {
  storeOverride = store || null;
}

module.exports = {
  MemoryStateStore,
  getStateStore,
  setStateStoreForTests,
};
