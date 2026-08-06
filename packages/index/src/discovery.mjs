/**
 * packages/index/src/discovery.mjs — transport-agnostic bazaar discovery request handling.
 *
 * [spec: the bazaar extension defines GET /discovery/resources and GET /discovery/search]
 *
 * This module owns the *semantics* of the two discovery endpoints: which query
 * parameters exist, how they are coerced, and the exact response envelope. It knows
 * nothing about Express, Node's `http` module or Vercel. Every transport adapter in the
 * repo funnels through it so there is exactly one definition of the wire format:
 *
 *   packages/index/src/http.mjs        -> Express (`mountDiscoveryRoutes`)
 *   packages/index/src/serverless.mjs  -> Node `(req, res)` handlers under /api
 *
 * No side effects on import. Query parameter names and response field names are
 * spec-exact. Do not rename them.
 */

export const X402_VERSION = 2;

/**
 * Query parsers disagree about repeated parameters: Express hands back an array,
 * URLSearchParams hands back the last value, Vercel hands back either. Take the first
 * value in every case and treat an empty string as "absent".
 */
export function firstString(v) {
  if (Array.isArray(v)) v = v[0];
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Filters shared by both endpoints. [spec: type, payTo, scheme, network, extensions] */
export function readFilters(q = {}) {
  return {
    type: firstString(q.type),
    payTo: firstString(q.payTo),
    scheme: firstString(q.scheme),
    network: firstString(q.network),
    // `extensions` is repeatable AND comma-separatable; the catalog's own asArray()
    // normalises both shapes, so it is passed through untouched.
    extensions: q.extensions,
  };
}

function failure(error, err) {
  return {
    status: 500,
    body: { error, message: String(err?.message ?? err) },
  };
}

/**
 * [spec: GET /discovery/resources — "Lists discoverable x402 resources."]
 *
 * Offset pagination. `pagination` is echoed alongside the flat `limit`/`offset`/`total`
 * fields so a client can read either shape.
 *
 * @param {object} catalog  the object returned by createCatalog()
 * @param {object} q        the parsed query string
 * @returns {{ status: number, body: object }}
 */
export function listResources(catalog, q = {}) {
  try {
    const result = catalog.list({
      ...readFilters(q),
      limit: firstString(q.limit),
      offset: firstString(q.offset),
    });
    return {
      status: 200,
      body: {
        x402Version: X402_VERSION,
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        pagination: { limit: result.limit, offset: result.offset, total: result.total },
      },
    };
  } catch (err) {
    return failure('discovery_failed', err);
  }
}

/**
 * [spec: GET /discovery/search — natural-language `query` is REQUIRED; the response
 *  carries `partialResults` and `pagination { limit, cursor }`.]
 *
 * An absent `query` parameter is a 400. A present-but-empty `query` is a browse: the
 * whole (filtered) catalog ordered by the quality prior alone.
 *
 * @param {object} catalog  the object returned by createCatalog()
 * @param {object} q        the parsed query string
 * @returns {{ status: number, body: object }}
 */
export function searchResources(catalog, q = {}) {
  if (q.query === undefined) {
    return {
      status: 400,
      body: {
        error: 'missing_query',
        message: 'the "query" parameter is required on /discovery/search',
      },
    };
  }
  try {
    const result = catalog.search({
      ...readFilters(q),
      query: Array.isArray(q.query) ? String(q.query[0] ?? '') : String(q.query),
      limit: firstString(q.limit),
      cursor: firstString(q.cursor),
    });
    return {
      status: 200,
      body: {
        x402Version: X402_VERSION,
        items: result.items,
        partialResults: result.partialResults,
        pagination: { limit: result.pagination.limit, cursor: result.pagination.cursor },
        total: result.total,
      },
    };
  } catch (err) {
    return failure('search_failed', err);
  }
}

export default { X402_VERSION, firstString, readFilters, listResources, searchResources };
