'use strict';

const { sendHermesMessage, HermesError } = require('../lib/hermes');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
  }

  try {
    const message = body && body.message;
    return res.status(200).json(await sendHermesMessage(message));
  } catch (error) {
    const status = error instanceof HermesError ? error.statusCode : 500;
    const message = error instanceof HermesError ? error.message : 'Unexpected server error.';
    return res.status(status).json({ error: message });
  }
};
