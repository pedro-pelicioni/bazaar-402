/**
 * GET /discovery/health — which catalog mode is active, how many records, which build.
 *
 * `mode: "seed"` is the zero-configuration read-only baseline; `mode: "kv"` means a
 * durable store is attached and the catalog is shared across instances. `build` carries
 * the commit this deployment is serving so a claim about the API can be checked against
 * a specific revision.
 *
 * All logic lives in packages/index — this file is the transport binding and nothing
 * else. See packages/index/src/serverless.mjs.
 */

import { healthHandler } from '../../packages/index/src/serverless.mjs';

export default function handler(req, res) {
  return healthHandler(req, res);
}
