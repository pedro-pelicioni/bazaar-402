/**
 * GET  /discovery/resources — list discoverable x402 resources (bazaar extension).
 * POST /discovery/resources — auto-catalog a resource (requires a durable store + token).
 *
 * Vercel Function, Node.js runtime, file-based routing: this file is served at
 * `/api/discovery/resources`, and vercel.json rewrites `/discovery/resources` onto it
 * ahead of the SPA catch-all.
 *
 * All logic lives in packages/index — this file is the transport binding and nothing
 * else. See packages/index/src/serverless.mjs.
 */

import { resourcesHandler } from '../../packages/index/src/serverless.mjs';

export default function handler(req, res) {
  return resourcesHandler(req, res);
}
