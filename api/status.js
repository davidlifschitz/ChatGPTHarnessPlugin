'use strict';

const { getHermesStatus, HermesError } = require('../lib/hermes');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    return res.status(200).json(await getHermesStatus());
  } catch (error) {
    const status = error instanceof HermesError ? error.statusCode : 500;
    const message = error instanceof HermesError ? error.message : 'Unexpected server error.';
    return res.status(status).json({ connected: false, error: message });
  }
};
