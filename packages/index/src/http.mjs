/**
 * packages/index/src/http.mjs — SEXTANT discovery endpoints.
 *
 * [spec: the bazaar extension defines GET /discovery/resources and GET /discovery/search]
 *
 * This module has NO side effects on import: it only defines and exports
 * `mountDiscoveryRoutes`. The caller owns the Express app, the port and the listen call.
 *
 * Query parameter names and response field names are spec-exact. Do not rename them.
 */

const X402_VERSION = 2;

/** Filters shared by both endpoints. [spec: type, payTo, scheme, network, extensions] */
function readFilters(q) {
  return {
    type: str(q.type),
    payTo: str(q.payTo),
    scheme: str(q.scheme),
    network: str(q.network),
    extensions: q.extensions,
  };
}

function str(v) {
  if (Array.isArray(v)) v = v[0];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * mountDiscoveryRoutes(app, catalog)
 *
 * Adds:
 *   GET /discovery/resources?type&payTo&scheme&network&extensions&limit&offset
 *   GET /discovery/search?query&limit&cursor&type&payTo&scheme&network&extensions
 *
 * @param {{ get: Function }} app       an Express-style app
 * @param {object} catalog             the object returned by createCatalog()
 * @param {{ basePath?: string }} [opts]
 * @returns {{ paths: string[] }}
 */
export function mountDiscoveryRoutes(app, catalog, opts = {}) {
  if (!app || typeof app.get !== 'function') throw new TypeError('mountDiscoveryRoutes: app must expose .get()');
  if (!catalog || typeof catalog.list !== 'function' || typeof catalog.search !== 'function') {
    throw new TypeError('mountDiscoveryRoutes: catalog must be the object returned by createCatalog()');
  }

  const base = opts.basePath ?? '/discovery';
  const resourcesPath = `${base}/resources`;
  const searchPath = `${base}/search`;

  /**
   * [spec: GET /discovery/resources — "Lists discoverable x402 resources."]
   * Offset pagination. `pagination` is echoed alongside the flat fields so a client can
   * read either shape.
   */
  app.get(resourcesPath, (req, res) => {
    try {
      const q = req.query ?? {};
      const result = catalog.list({ ...readFilters(q), limit: str(q.limit), offset: str(q.offset) });
      res.json({
        x402Version: X402_VERSION,
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        pagination: { limit: result.limit, offset: result.offset, total: result.total },
      });
    } catch (err) {
      res.status(500).json({ error: 'discovery_failed', message: String(err?.message ?? err) });
    }
  });

  /**
   * [spec: GET /discovery/search — natural-language `query` is REQUIRED; response
   *  carries `partialResults` and `pagination { limit, cursor }`.]
   *
   * An absent `query` parameter is a 400. A present-but-empty `query` is a browse:
   * the whole (filtered) catalog ordered by the quality prior alone.
   */
  app.get(searchPath, (req, res) => {
    try {
      const q = req.query ?? {};
      if (q.query === undefined) {
        return res.status(400).json({
          error: 'missing_query',
          message: 'the "query" parameter is required on /discovery/search',
        });
      }
      const result = catalog.search({
        ...readFilters(q),
        query: Array.isArray(q.query) ? q.query[0] : String(q.query),
        limit: str(q.limit),
        cursor: str(q.cursor),
      });
      res.json({
        x402Version: X402_VERSION,
        items: result.items,
        partialResults: result.partialResults,
        pagination: { limit: result.pagination.limit, cursor: result.pagination.cursor },
        total: result.total,
      });
    } catch (err) {
      res.status(500).json({ error: 'search_failed', message: String(err?.message ?? err) });
    }
  });

  return { paths: [resourcesPath, searchPath] };
}

export default { mountDiscoveryRoutes };
