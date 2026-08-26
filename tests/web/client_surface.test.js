const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('browser bundle contains no Hermes server configuration or bearer handling', () => {
  assert.equal(html.includes('HERMES_API_KEY'), false);
  assert.equal(html.includes('HERMES_BASE_URL'), false);
  assert.equal(/Authorization\s*:/i.test(html), false);
  assert.equal(/Bearer\s+/i.test(html), false);
});

test('browser only calls same-origin product routes', () => {
  assert.match(html, /fetch\('\/api\/status'/);
  assert.match(html, /fetch\('\/api\/chat'/);
  assert.equal(/https?:\/\//i.test(html), false);
});
