'use strict';

// The M2 adapter uses Hermes Cloud's first-party native PKCE bearer + one-use WS ticket
// protocol. It intentionally has no API_SERVER_KEY/self-hosted REST fallback.
module.exports = require('./hermes-cloud-rpc');
