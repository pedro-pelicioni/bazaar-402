/**
 * Catch-all for unknown /discovery/* paths.
 *
 * Without this, an unrecognised path falls through Vercel's rewrite chain to the SPA's
 * `/(.*) -> /index.html` rule and answers `200 text/html`. An agent that mistypes an
 * endpoint would then receive a success status and a page of markup, and have to infer
 * from the content type that something went wrong. That is the opposite of the contract
 * this project states everywhere else: every rejection carries a non-null, readable
 * reason.
 *
 * So: a real function that always exists, answers 404, and names what it does serve.
 * Vercel resolves concrete filenames before a catch-all, so resources / search / health
 * are unaffected.
 */

import { handlePreflight, sendJson } from '../../packages/index/src/serverless.mjs';

const ENDPOINTS = ['/discovery/resources', '/discovery/search', '/discovery/health'];

export default function handler(req, res) {
  if (handlePreflight(req, res, 'GET, HEAD, POST, OPTIONS')) return undefined;

  const path = (req.url || '').split('?')[0] || '/discovery';

  return sendJson(res, 404, {
    ok: false,
    reason: `no such discovery endpoint: ${path}. This facilitator serves ${ENDPOINTS.join(', ')}.`,
    endpoints: ENDPOINTS,
  });
}
