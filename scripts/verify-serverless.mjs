#!/usr/bin/env node
/**
 * scripts/verify-serverless.mjs — exercise the deployed discovery API without deploying.
 *
 * `npx vercel dev` is the faithful path but needs an authenticated Vercel account, which
 * a checkout of this repo does not have. So this harness imports the ACTUAL function
 * files under api/ — the same modules Vercel will load — drives them with mock Node
 * `req`/`res` objects, and asserts the wire contract:
 *
 *   · response shapes are spec-exact (`items`, `partialResults`, `pagination{limit,cursor}`)
 *   · every filter narrows the result set
 *   · offset and cursor pagination walk the catalog without overlap
 *   · `_explain` is present on search results and its parts sum to `_score`
 *   · CORS is permissive and the OPTIONS preflight is answered
 *   · `Cache-Control` carries an s-maxage + stale-while-revalidate for the CDN
 *   · the write path degrades cleanly with no store, and works with one
 *   · vercel.json routes /discovery/* to the functions BEFORE the SPA catch-all
 *
 * It is deliberately NOT named *.test.mjs: `npm test` counts suites, and this is a
 * deployment check rather than a unit suite.
 *
 *   node scripts/verify-serverless.mjs
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import resourcesFn from '../api/discovery/resources.mjs';
import searchFn from '../api/discovery/search.mjs';
import healthFn from '../api/discovery/health.mjs';
import {
  resourcesHandler,
  searchHandler,
  healthHandler,
  resetState,
} from '../packages/index/src/serverless.mjs';

const ROOT = new URL('..', import.meta.url);

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => {
          passed++;
          console.log(`  ok   ${name}`);
        },
        (err) => {
          failures.push({ name, err });
          console.log(`  FAIL ${name}\n         ${err?.message ?? err}`);
        },
      );
    }
    passed++;
    console.log(`  ok   ${name}`);
    return Promise.resolve();
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL ${name}\n         ${err?.message ?? err}`);
    return Promise.resolve();
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

/* ─────────────────────────────── mocks ─────────────────────────────── */

function mockReq(method, url, { headers = {}, body, query } = {}) {
  const req = { method, url, headers };
  if (body !== undefined) req.body = body;
  if (query !== undefined) req.query = query;
  return req;
}

function mockRes() {
  return {
    statusCode: 0,
    headers: Object.create(null),
    raw: '',
    ended: false,
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = String(v);
    },
    getHeader(k) {
      return this.headers[String(k).toLowerCase()];
    },
    end(chunk) {
      this.raw = chunk === undefined ? '' : String(chunk);
      this.ended = true;
    },
    get json() {
      return this.raw ? JSON.parse(this.raw) : null;
    },
  };
}

/** Drive one handler and return the finished mock response. */
async function call(fn, req) {
  const res = mockRes();
  await fn(req, res);
  assert(res.ended, 'handler never ended the response');
  return res;
}

/* ─────────────────────────── the checks ─────────────────────────── */

async function main() {
  console.log('\nSEXTANT serverless verification\n');

  /* ---------- 1. GET /discovery/resources through the real api/ file ---------- */
  console.log('api/discovery/resources.mjs');

  const list = await call(resourcesFn, mockReq('GET', '/discovery/resources?limit=5'));

  await check('200 with the spec envelope', () => {
    eq(list.statusCode, 200, 'status');
    const b = list.json;
    eq(b.x402Version, 2, 'x402Version');
    assert(Array.isArray(b.items), '`items` must be an array');
    assert(typeof b.total === 'number' && b.total > 0, '`total` must be a positive number');
    eq(b.limit, 5, 'limit echoed');
    eq(b.offset, 0, 'offset echoed');
    assert(b.pagination && b.pagination.limit === 5 && b.pagination.offset === 0, '`pagination` mirrors limit/offset');
    eq(b.items.length, 5, 'limit is honoured');
  });

  await check('records carry the CONTRACT.md field names', () => {
    const rec = list.json.items[0];
    for (const field of ['id', 'resource', 'type', 'network', 'scheme', 'payTo', 'asset', 'maxAmountRequired', 'extensions', 'lastSeenAt', 'settlements']) {
      assert(field in rec, `record is missing \`${field}\``);
    }
    assert(typeof rec.resource.url === 'string' && rec.resource.url.length > 0, 'resource.url');
  });

  await check('the catalog is seeded at cold start (no configuration required)', () => {
    assert(list.json.total >= 25, `expected the seed corpus, got total=${list.json.total}`);
  });

  await check('CORS is permissive', () => {
    eq(list.getHeader('access-control-allow-origin'), '*', 'Access-Control-Allow-Origin');
    assert(/GET/.test(list.getHeader('access-control-allow-methods') ?? ''), 'Access-Control-Allow-Methods');
    assert(/Content-Type/i.test(list.getHeader('access-control-allow-headers') ?? ''), 'Access-Control-Allow-Headers');
  });

  await check('Cache-Control is CDN-friendly', () => {
    const cc = list.getHeader('cache-control') ?? '';
    assert(/s-maxage=\d+/.test(cc), `expected an s-maxage, got "${cc}"`);
    assert(/stale-while-revalidate=\d+/.test(cc), `expected stale-while-revalidate, got "${cc}"`);
  });

  await check('OPTIONS preflight answers 204 with the allowed methods', async () => {
    const res = await call(resourcesFn, mockReq('OPTIONS', '/discovery/resources'));
    eq(res.statusCode, 204, 'preflight status');
    eq(res.getHeader('access-control-allow-origin'), '*', 'preflight ACAO');
    assert(/POST/.test(res.getHeader('access-control-allow-methods') ?? ''), 'preflight allows POST');
  });

  await check('filters narrow the set: type=mcp', async () => {
    const res = await call(resourcesFn, mockReq('GET', '/discovery/resources?type=mcp&limit=100'));
    const items = res.json.items;
    assert(items.length > 0, 'expected at least one MCP resource');
    assert(items.every((r) => r.type === 'mcp'), 'a non-mcp record leaked through the type filter');
    assert(items.length < list.json.total, 'the filter did not narrow anything');
  });

  await check('filters narrow the set: payTo, scheme, network, extensions', async () => {
    const all = await call(resourcesFn, mockReq('GET', '/discovery/resources?limit=100'));
    const payTo = all.json.items[0].payTo;

    const byPayTo = await call(resourcesFn, mockReq('GET', `/discovery/resources?payTo=${payTo}&limit=100`));
    assert(byPayTo.json.items.every((r) => r.payTo === payTo), 'payTo filter leaked');
    assert(byPayTo.json.total < all.json.total, 'payTo filter did not narrow');

    const byScheme = await call(resourcesFn, mockReq('GET', '/discovery/resources?scheme=exact&limit=100'));
    assert(byScheme.json.items.every((r) => r.scheme === 'exact'), 'scheme filter leaked');

    const byNetwork = await call(resourcesFn, mockReq('GET', '/discovery/resources?network=stellar%3Atestnet&limit=100'));
    assert(byNetwork.json.total > 0 && byNetwork.json.items.every((r) => r.network === 'stellar:testnet'), 'network filter');

    const byExt = await call(resourcesFn, mockReq('GET', '/discovery/resources?extensions=bazaar&limit=100'));
    assert(byExt.json.total > 0 && byExt.json.items.every((r) => r.extensions.includes('bazaar')), 'extensions filter');

    const byMissingExt = await call(resourcesFn, mockReq('GET', '/discovery/resources?extensions=nope&limit=100'));
    eq(byMissingExt.json.total, 0, 'an unknown extension must match nothing');
  });

  await check('offset pagination does not overlap', async () => {
    const p1 = await call(resourcesFn, mockReq('GET', '/discovery/resources?limit=10&offset=0'));
    const p2 = await call(resourcesFn, mockReq('GET', '/discovery/resources?limit=10&offset=10'));
    eq(p1.json.items.length, 10, 'page 1 size');
    assert(p2.json.items.length > 0, 'page 2 is empty');
    const ids = new Set(p1.json.items.map((r) => r.id));
    assert(p2.json.items.every((r) => !ids.has(r.id)), 'offset paging returned a duplicate');
    eq(p2.json.offset, 10, 'offset echoed');
  });

  await check('Vercel-style pre-parsed req.query is honoured', async () => {
    const res = await call(resourcesFn, mockReq('GET', '/discovery/resources', { query: { type: 'mcp', limit: '3' } }));
    eq(res.statusCode, 200, 'status');
    eq(res.json.items.length, 3, 'limit from req.query');
    assert(res.json.items.every((r) => r.type === 'mcp'), 'type from req.query');
  });

  /* ---------- 2. GET /discovery/search ---------- */
  console.log('\napi/discovery/search.mjs');

  const search = await call(searchFn, mockReq('GET', '/discovery/search?query=invoice%20ocr&limit=5'));

  await check('200 with partialResults and pagination{limit,cursor}', () => {
    eq(search.statusCode, 200, 'status');
    const b = search.json;
    eq(b.x402Version, 2, 'x402Version');
    assert(Array.isArray(b.items) && b.items.length > 0, '`items` must be a non-empty array');
    eq(typeof b.partialResults, 'boolean', '`partialResults` must be a boolean');
    assert(b.pagination && typeof b.pagination === 'object', '`pagination` must be an object');
    assert('limit' in b.pagination, '`pagination.limit` is required');
    assert('cursor' in b.pagination, '`pagination.cursor` is required (null when unavailable)');
    eq(b.pagination.limit, 5, 'pagination.limit');
  });

  await check('the query actually ranks — invoice ocr finds the OCR service first', () => {
    const top = search.json.items[0];
    assert(/ocr/i.test(top.resource.url) || /ocr/i.test(top.resource.serviceName ?? ''), `unexpected top hit: ${top.id}`);
  });

  await check('_explain is present and its parts sum to _score', () => {
    for (const rec of search.json.items) {
      assert(rec._explain && typeof rec._explain === 'object', `_explain missing on ${rec.id}`);
      const p = rec._explain.parts;
      assert(p && typeof p === 'object', `_explain.parts missing on ${rec.id}`);
      for (const key of ['relevance', 'completeness', 'popularity', 'recency']) {
        assert(typeof p[key] === 'number', `_explain.parts.${key} missing on ${rec.id}`);
      }
      const sum = p.relevance + p.completeness + p.popularity + p.recency;
      assert(Math.abs(sum - rec._score) < 1e-3, `parts sum ${sum} != _score ${rec._score} on ${rec.id}`);
      assert(Array.isArray(rec._explain.terms), `_explain.terms missing on ${rec.id}`);
      assert(rec._explain.terms.every((t) => 'tf' in t && 'idf' in t && 'contribution' in t), '_explain.terms need tf/idf/contribution');
    }
  });

  await check('cursor pagination walks the result set without overlap', async () => {
    const p1 = await call(searchFn, mockReq('GET', '/discovery/search?query=stellar&limit=2'));
    assert(p1.json.partialResults === true, 'expected more matches than one page');
    const cursor = p1.json.pagination.cursor;
    assert(typeof cursor === 'string' && cursor.length > 0, 'expected a continuation cursor');

    const p2 = await call(searchFn, mockReq('GET', `/discovery/search?query=stellar&limit=2&cursor=${encodeURIComponent(cursor)}`));
    const ids = new Set(p1.json.items.map((r) => r.id));
    assert(p2.json.items.length > 0, 'page 2 is empty');
    assert(p2.json.items.every((r) => !ids.has(r.id)), 'cursor paging returned a duplicate');
  });

  await check('the last page reports partialResults=false and cursor=null', async () => {
    const res = await call(searchFn, mockReq('GET', '/discovery/search?query=invoice%20ocr&limit=100'));
    eq(res.json.partialResults, false, 'partialResults on the final page');
    eq(res.json.pagination.cursor, null, 'cursor on the final page');
  });

  await check('search honours the shared filters', async () => {
    const res = await call(searchFn, mockReq('GET', '/discovery/search?query=stellar&type=mcp&limit=100'));
    assert(res.json.items.length > 0, 'expected MCP hits for "stellar"');
    assert(res.json.items.every((r) => r.type === 'mcp'), 'type filter leaked on search');
  });

  await check('a missing query parameter is a 400, not an empty 200', async () => {
    const res = await call(searchFn, mockReq('GET', '/discovery/search'));
    eq(res.statusCode, 400, 'status');
    eq(res.json.error, 'missing_query', 'error code');
    eq(res.getHeader('access-control-allow-origin'), '*', 'CORS is set on errors too');
  });

  await check('an empty query browses the catalog by the quality prior', async () => {
    const res = await call(searchFn, mockReq('GET', '/discovery/search?query=&limit=5'));
    eq(res.statusCode, 200, 'status');
    eq(res.json.items.length, 5, 'browse returns results');
  });

  await check('POST to /discovery/search is 405 with an Allow header', async () => {
    const res = await call(searchFn, mockReq('POST', '/discovery/search?query=x'));
    eq(res.statusCode, 405, 'status');
    assert(/GET/.test(res.getHeader('allow') ?? ''), 'Allow header');
  });

  /* ---------- 3. GET /discovery/health ---------- */
  console.log('\napi/discovery/health.mjs');

  await check('reports mode, record count and build', async () => {
    const res = await call(healthFn, mockReq('GET', '/discovery/health'));
    eq(res.statusCode, 200, 'status');
    const b = res.json;
    eq(b.ok, true, 'ok');
    eq(b.mode, 'seed', 'unconfigured deployments run in read-only seed mode');
    eq(b.writable, false, 'read-only without a store');
    assert(typeof b.records === 'number' && b.records > 0, 'records');
    eq(b.records, b.seededRecords + b.liveRecords, 'seeded + live must equal records');
    eq(b.durableStore.configured, false, 'durableStore.configured');
    assert(b.build && 'commit' in b.build && 'env' in b.build && 'node' in b.build, 'build info');
    eq(res.getHeader('cache-control'), 'no-store', 'health must not be CDN-cached');
  });

  /* ---------- 4. write path ---------- */
  console.log('\nwrite path (POST /discovery/resources)');

  const SAMPLE = {
    resource: {
      url: 'https://api.example.test/v1/echo',
      serviceName: 'Echo',
      description: 'Echoes a payload back, used only to verify the write path end to end.',
      tags: ['test', 'echo'],
    },
    type: 'http',
    payTo: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    asset: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    maxAmountRequired: '1000',
    input: { type: 'http', method: 'POST', body: { text: 'hi' } },
    output: { type: 'json' },
    extensions: ['bazaar'],
  };

  await check('with no store configured: 503 and an actionable reason, never a crash', async () => {
    resetState();
    const res = mockRes();
    await resourcesHandler(mockReq('POST', '/discovery/resources', { body: SAMPLE }), res, {});
    eq(res.statusCode, 503, 'status');
    eq(res.json.ok, false, 'ok');
    assert(/KV_REST_API_URL/.test(res.json.reason), `reason should name the env vars, got: ${res.json.reason}`);
  });

  await check('store configured but no write token: still refused, with the reason', async () => {
    resetState();
    const restore = stubFetch(new Map());
    try {
      const res = mockRes();
      await resourcesHandler(mockReq('POST', '/discovery/resources', { body: SAMPLE }), res, KV_ENV);
      eq(res.statusCode, 503, 'status');
      assert(/SEXTANT_WRITE_TOKEN/.test(res.json.reason), `reason should name the token, got: ${res.json.reason}`);
    } finally {
      restore();
    }
  });

  await check('store + token, wrong bearer: 401', async () => {
    resetState();
    const restore = stubFetch(new Map());
    try {
      const res = mockRes();
      await resourcesHandler(
        mockReq('POST', '/discovery/resources', { body: SAMPLE, headers: { authorization: 'Bearer nope' } }),
        res,
        { ...KV_ENV, SEXTANT_WRITE_TOKEN: 's3cret' },
      );
      eq(res.statusCode, 401, 'status');
    } finally {
      restore();
    }
  });

  await check('store + token + bearer: the record is validated, persisted and then served', async () => {
    resetState();
    const kv = new Map();
    const restore = stubFetch(kv);
    const env = { ...KV_ENV, SEXTANT_WRITE_TOKEN: 's3cret', SEXTANT_KV_TTL_MS: '0' };
    try {
      const write = mockRes();
      await resourcesHandler(
        mockReq('POST', '/discovery/resources', { body: SAMPLE, headers: { authorization: 'Bearer s3cret' } }),
        write,
        env,
      );
      eq(write.statusCode, 200, 'write status');
      eq(write.json.ok, true, 'write ok');
      eq(write.json.id, SAMPLE.resource.url, 'write id');
      eq(write.json.durable, true, 'the write claims durability');
      eq(kv.size, 1, 'the durable store holds exactly one record');

      // A different instance would see it too: rebuild from scratch and search for it.
      resetState();
      const found = mockRes();
      await searchHandler(mockReq('GET', '/discovery/search?query=echoes%20a%20payload&limit=5'), found, env);
      eq(found.statusCode, 200, 'search status');
      assert(found.json.items.some((r) => r.id === SAMPLE.resource.url), 'the persisted record is not discoverable');

      const health = mockRes();
      await healthHandler(mockReq('GET', '/discovery/health'), health, env);
      eq(health.json.mode, 'kv', 'health reports kv mode');
      eq(health.json.writable, true, 'health reports writable');
      eq(health.json.durableStore.configured, true, 'durableStore.configured');
      eq(health.json.durableStore.reachable, true, 'durableStore.reachable');
      eq(health.json.liveRecords, 1, 'the written record is counted as live, not seeded');
    } finally {
      restore();
      resetState();
    }
  });

  await check('a hostile field is soft-dropped, the record survives', async () => {
    resetState();
    const kv = new Map();
    const restore = stubFetch(kv);
    try {
      const res = mockRes();
      await resourcesHandler(
        mockReq('POST', '/discovery/resources', {
          body: { ...SAMPLE, routeTemplate: '/v1/parse/%252e%252e/admin/keys' },
          headers: { authorization: 'Bearer s3cret' },
        }),
        res,
        { ...KV_ENV, SEXTANT_WRITE_TOKEN: 's3cret' },
      );
      eq(res.statusCode, 200, 'the record must survive');
      assert(res.json.dropped.includes('routeTemplate'), `expected routeTemplate in dropped, got ${JSON.stringify(res.json.dropped)}`);
      const stored = JSON.parse([...kv.values()][0]);
      assert(!('routeTemplate' in stored), 'the traversal template was persisted');
    } finally {
      restore();
      resetState();
    }
  });

  await check('an unreachable store degrades to the seeded catalog instead of erroring', async () => {
    resetState();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    try {
      const res = mockRes();
      await searchHandler(mockReq('GET', '/discovery/search?query=invoice&limit=3'), res, KV_ENV);
      eq(res.statusCode, 200, 'reads must still succeed');
      assert(res.json.items.length > 0, 'the seeded catalog should still answer');

      const health = mockRes();
      await healthHandler(mockReq('GET', '/discovery/health'), health, KV_ENV);
      eq(health.json.mode, 'seed', 'a broken store falls back to seed mode');
      eq(health.json.durableStore.configured, true, 'still reports that a store was configured');
      assert(health.json.durableStore.error, 'the failure reason must be reported');
    } finally {
      globalThis.fetch = realFetch;
      resetState();
    }
  });

  await check('junk env vars never crash the read path', async () => {
    for (const env of [
      {},
      { KV_REST_API_URL: '' },
      { KV_REST_API_URL: 'not a url', KV_REST_API_TOKEN: 'x' },
      { KV_REST_API_TOKEN: 'token-without-a-url' },
      { KV_REST_API_URL: 'redis://nope', KV_REST_API_TOKEN: 'x' },
    ]) {
      resetState();
      const res = mockRes();
      await resourcesHandler(mockReq('GET', '/discovery/resources?limit=1'), res, env);
      eq(res.statusCode, 200, `env ${JSON.stringify(env)} broke the read path`);
    }
    resetState();
  });

  /* ---------- 5. routing ---------- */
  console.log('\nvercel.json routing');

  const vercelJson = JSON.parse(readFileSync(fileURLToPath(new URL('vercel.json', ROOT)), 'utf8'));

  await check('the SPA catch-all is last and every /discovery route precedes it', () => {
    const rewrites = vercelJson.rewrites ?? [];
    const catchAllIndex = rewrites.findIndex((r) => r.source === '/(.*)');
    assert(catchAllIndex !== -1, 'the SPA catch-all rewrite is missing');
    eq(catchAllIndex, rewrites.length - 1, 'the SPA catch-all must be the LAST rewrite');
    for (const path of ['/discovery/resources', '/discovery/search', '/discovery/health']) {
      const i = rewrites.findIndex((r) => r.source === path);
      assert(i !== -1, `no rewrite for ${path}`);
      assert(i < catchAllIndex, `${path} is shadowed by the catch-all`);
      eq(rewrites[i].destination, `/api${path}`, `${path} destination`);
    }
  });

  await check('first-match routing sends /discovery/* to the functions, not index.html', () => {
    // Vercel evaluates rewrites top to bottom, first match wins, after the filesystem
    // check. Replay that here over the real config.
    const resolve = (pathname) => {
      for (const rule of vercelJson.rewrites ?? []) {
        const dest = applyRewrite(rule, pathname);
        if (dest !== null) return dest;
      }
      return null;
    };
    eq(resolve('/discovery/search'), '/api/discovery/search', '/discovery/search');
    eq(resolve('/discovery/resources'), '/api/discovery/resources', '/discovery/resources');
    eq(resolve('/discovery/health'), '/api/discovery/health', '/discovery/health');
    // The whole namespace belongs to the API: an unknown /discovery/* path must 404 from
    // a missing function, not silently render the single-page app.
    eq(resolve('/discovery/nope'), '/api/discovery/nope', 'unknown /discovery paths stay in the API');
    eq(resolve('/console'), '/index.html', 'the SPA still catches its own routes');
    eq(resolve('/'), '/index.html', 'the landing page still resolves');
  });

  await check('each fixed rewrite destination has a function file behind it', () => {
    let checked = 0;
    for (const rule of vercelJson.rewrites ?? []) {
      // The `/discovery/:path*` guard deliberately points at paths that do not exist, so
      // an unknown endpoint 404s from the API instead of rendering the SPA.
      if (!rule.destination.startsWith('/api/') || rule.destination.includes(':')) continue;
      readFileSync(fileURLToPath(new URL(`.${rule.destination}.mjs`, ROOT)), 'utf8');
      checked++;
    }
    eq(checked, 3, 'expected three concrete function routes');
  });

  await check('the functions glob in vercel.json matches the files that exist', () => {
    const keys = Object.keys(vercelJson.functions ?? {});
    assert(keys.length > 0, 'no functions configuration');
    assert(keys.some((k) => k === 'api/discovery/*.mjs'), `unexpected functions globs: ${keys.join(', ')}`);
    // api/**/*.+(js|mjs|ts|tsx) is the zero-config glob Vercel uses to find functions,
    // so .mjs under api/ is picked up without further configuration.
    for (const name of ['resources', 'search', 'health']) {
      readFileSync(fileURLToPath(new URL(`api/discovery/${name}.mjs`, ROOT)), 'utf8');
    }
  });

  /* ---------- 6. over a real socket ---------- */
  console.log('\nover a real node:http socket (real IncomingMessage / ServerResponse)');

  resetState();
  const server = createServer((req, res) => {
    // Exactly what vercel.json's rewrites do: /discovery/* -> the function file.
    const path = new URL(req.url, 'http://localhost').pathname;
    const fn = { '/discovery/resources': resourcesFn, '/discovery/search': searchFn, '/discovery/health': healthFn }[path];
    if (!fn) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    Promise.resolve(fn(req, res)).catch((err) => {
      res.statusCode = 500;
      res.end(String(err));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    await check('GET /discovery/search over HTTP returns ranked JSON', async () => {
      const res = await fetch(`${origin}/discovery/search?query=invoice%20ocr&limit=3`);
      eq(res.status, 200, 'status');
      assert(/application\/json/.test(res.headers.get('content-type') ?? ''), 'content-type');
      eq(res.headers.get('access-control-allow-origin'), '*', 'CORS over the wire');
      const body = await res.json();
      assert(body.items.length > 0 && body.items[0]._explain, 'ranked items with _explain');
    });

    await check('GET /discovery/resources over HTTP honours filters', async () => {
      const res = await fetch(`${origin}/discovery/resources?type=mcp&limit=100`);
      const body = await res.json();
      assert(body.items.length > 0 && body.items.every((r) => r.type === 'mcp'), 'type filter over the wire');
    });

    await check('OPTIONS preflight over HTTP returns 204 with no body', async () => {
      const res = await fetch(`${origin}/discovery/resources`, { method: 'OPTIONS' });
      eq(res.status, 204, 'status');
      eq(res.headers.get('access-control-allow-origin'), '*', 'preflight ACAO');
    });

    await check('a streamed POST body is parsed (no framework body parser present)', async () => {
      const res = await fetch(`${origin}/discovery/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer nope' },
        body: JSON.stringify(SAMPLE),
      });
      // No store is configured here, so this is the read-only refusal — which proves the
      // request reached the handler and was answered rather than hanging on the stream.
      eq(res.status, 503, 'status');
      const body = await res.json();
      eq(body.ok, false, 'ok');
    });

    await check('GET /discovery/health over HTTP reports the live mode', async () => {
      const res = await fetch(`${origin}/discovery/health`);
      eq(res.status, 200, 'status');
      const body = await res.json();
      eq(body.mode, 'seed', 'mode');
      assert(body.records > 0, 'records');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  /* ---------- done ---------- */
  console.log(
    `\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} check(s) passed, ${failures.length} failed\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

/* ─────────────────────────── helpers ─────────────────────────── */

const KV_ENV = { KV_REST_API_URL: 'https://kv.example.test', KV_REST_API_TOKEN: 'kv-token' };

/**
 * Stand in for the Vercel KV / Upstash REST endpoint with a Map, so the write path is
 * exercised for real (same fetch call, same command encoding, same response parsing)
 * without a network or an account.
 */
function stubFetch(hash) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const cmd = JSON.parse(init.body);
    const [verb, , field, value] = cmd;
    const reply = (result) =>
      new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
    switch (String(verb).toUpperCase()) {
      case 'HGETALL': {
        const flat = [];
        for (const [k, v] of hash) flat.push(k, v);
        return reply(flat);
      }
      case 'HSET':
        hash.set(field, value);
        return reply(1);
      case 'HDEL':
        return reply(hash.delete(field) ? 1 : 0);
      case 'HLEN':
        return reply(hash.size);
      default:
        return reply(null);
    }
  };
  return () => {
    globalThis.fetch = real;
  };
}

/**
 * Compile a vercel.json rewrite `source` the way Vercel matches it: a bare path is an
 * exact match, `(...)` groups pass through as regex, `:param` is one segment and
 * `:param*` is zero or more. Returns the regex plus the parameter names in capture order
 * so the destination can be filled in. Only the forms this repo uses need to work.
 */
function compileSource(source) {
  const params = [];
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '(') depth++;
        else if (source[j] === ')') depth--;
        j++;
      }
      out += source.slice(i, j); // pass the group through untouched
      params.push(null); // an anonymous capture
      i = j;
    } else if (ch === ':') {
      let j = i + 1;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      const name = source.slice(i + 1, j);
      if (source[j] === '*') {
        // `/a/:p*` matches `/a` as well as `/a/x/y`, so the separator is optional.
        if (out.endsWith('/')) out = out.slice(0, -1);
        out += '(?:/(.*))?';
        params.push({ name, star: true });
        i = j + 1;
      } else {
        out += '([^/]+)';
        params.push({ name, star: false });
        i = j;
      }
    } else {
      out += ch.replace(/[.*+?^${}|[\]\\]/g, '\\$&');
      i++;
    }
  }
  return { re: new RegExp(`^${out}$`), params };
}

/** Apply one rewrite rule to a pathname; returns the destination, or null on no match. */
function applyRewrite(rule, pathname) {
  const { re, params } = compileSource(rule.source);
  const m = re.exec(pathname);
  if (!m) return null;
  let dest = rule.destination;
  params.forEach((p, idx) => {
    if (!p) return;
    const value = m[idx + 1] ?? '';
    dest = dest.replace(p.star ? `:${p.name}*` : `:${p.name}`, value);
  });
  return dest;
}

main().catch((err) => {
  console.error(`\nverification harness crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
