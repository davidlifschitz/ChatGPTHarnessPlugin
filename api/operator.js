'use strict';

const { handleOperatorApproval } = require('../lib/mcp-auth');

module.exports = async function operatorHandler(req, res) {
  return handleOperatorApproval(req, res);
};
