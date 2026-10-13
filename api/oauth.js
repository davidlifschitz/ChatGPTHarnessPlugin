'use strict';

const { handleOAuth } = require('../lib/mcp-auth');

const OAUTH_ROUTES = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/mcp/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/oauth/register',
  '/oauth/authorize',
  '/oauth/status',
  '/oauth/complete',
  '/oauth/token',
]);

function routeFromRequest(req) {
  try {
    const url = new URL(req.url || '/', 'https://route.invalid');
    const queryRoutes = url.searchParams.getAll('route');
    const frameworkRoute = req?.query?.route;
    const candidates = new Set([
      ...(typeof frameworkRoute === 'string' ? [frameworkRoute] : []),
      ...(queryRoutes.length === 1 ? queryRoutes : []),
    ]);
    if (queryRoutes.length > 1) return '';
    if (candidates.size === 1 && OAUTH_ROUTES.has(candidates.values().next().value)) {
      return candidates.values().next().value;
    }
    if (candidates.size > 0) return '';

    const pathname = url.pathname;
    if (pathname === '/api') return '/';
    if (pathname.startsWith('/api/')) return pathname.slice('/api'.length);
    return OAUTH_ROUTES.has(pathname) ? pathname : '';
  } catch {
    return '';
  }
}

module.exports = async function oauthHandler(req, res) {
  return handleOAuth(req, res, routeFromRequest(req));
};
