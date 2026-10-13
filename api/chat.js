'use strict';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    error: 'This diagnostic action is unavailable. Use the authenticated plugin.',
  });
};
