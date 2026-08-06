/**
 * GET /discovery/search — natural-language search over the bazaar catalog.
 *
 * Returns spec-exact `partialResults` and `pagination { limit, cursor }`, and a
 * per-result `_explain` breaking the BM25 + quality-prior score into its addends.
 *
 * Vercel Function, Node.js runtime, file-based routing: this file is served at
 * `/api/discovery/search`, and vercel.json rewrites `/discovery/search` onto it ahead of
 * the SPA catch-all.
 *
 * All logic lives in packages/index — this file is the transport binding and nothing
 * else. See packages/index/src/serverless.mjs.
 */

import { searchHandler } from '../../packages/index/src/serverless.mjs';

export default function handler(req, res) {
  return searchHandler(req, res);
}
