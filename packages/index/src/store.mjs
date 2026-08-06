/**
 * packages/index/src/store.mjs — OPTIONAL durable catalog store.
 *
 * The catalog itself (packages/index/src/index.mjs) is in-memory by design: one process,
 * one Map, a JSON snapshot if you want one. That is exactly right for `npm run dev:all`
 * and wrong for a serverless deployment, where every cold start begins with an empty
 * process and no two invocations share a heap.
 *
 * This module is the escape hatch. When a Redis-compatible REST endpoint is configured
 * (Vercel KV or Upstash Redis — both speak the same protocol and export the same env
 * vars), the deployment gains a durable, shared catalog and the auto-cataloging write
 * path becomes real. When it is NOT configured, `createStore()` returns `null` and the
 * caller falls back to the read-only seeded catalog.
 *
 * THE CONTRACT THAT MATTERS: nothing here ever throws and nothing here ever requires an
 * environment variable to exist. A missing, malformed or unreachable store degrades to
 * `null` or to `{ ok: false, reason }` — never to a 500 on a read path.
 *
 * Zero dependencies: the Upstash/Vercel-KV REST protocol is "POST a JSON array of the
 * Redis command, get back `{ result }` or `{ error }`", which `fetch` covers entirely.
 *
 * Storage layout — a single Redis HASH, `id -> JSON(record)`:
 *
 *   HGETALL sextant:catalog:v1            read the whole catalog (one round trip)
 *   HSET    sextant:catalog:v1 <id> <json>  upsert one record
 *   HDEL    sextant:catalog:v1 <id>         remove one record
 *
 * A hash rather than one JSON blob because HSET on a field is atomic: two lambda
 * instances cataloging different resources at the same moment cannot clobber each other,
 * which a read-modify-write of a single key absolutely would.
 */

export const DEFAULT_STORE_KEY = 'sextant:catalog:v1';
const DEFAULT_TIMEOUT_MS = 4000;
/** Refuse to store an absurd record rather than filling the hash with junk. */
const MAX_RECORD_BYTES = 64 * 1024;

function trimmed(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';
}

/**
 * readStoreConfig(env) -> config | null
 *
 * `KV_REST_API_*` is what Vercel injects for a Redis/KV integration; the
 * `UPSTASH_REDIS_REST_*` pair is what Upstash injects when you wire the database up
 * yourself. Accept both — they are the same protocol — and return `null` unless BOTH a
 * URL and a token are present.
 */
export function readStoreConfig(env = process.env) {
  const e = env ?? {};
  const url = trimmed(e.KV_REST_API_URL) || trimmed(e.UPSTASH_REDIS_REST_URL);
  const token = trimmed(e.KV_REST_API_TOKEN) || trimmed(e.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;

  let origin;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    origin = parsed.origin;
  } catch {
    return null; // an unparseable URL is not a configured store
  }

  const timeoutMs = Number.parseInt(e.SEXTANT_KV_TIMEOUT_MS ?? '', 10);

  return {
    url: origin,
    token,
    key: trimmed(e.SEXTANT_KV_KEY) || DEFAULT_STORE_KEY,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    // Host only — the token never leaves this module and the full URL is not echoed
    // anywhere a health endpoint might print it.
    host: new URL(origin).host,
  };
}

/**
 * HGETALL comes back as a flat `[field, value, field, value, ...]` array over the raw
 * REST protocol, but the official clients hand back an object. Accept both so this works
 * against whichever shape the provider is serving today.
 */
function hashEntries(result) {
  if (Array.isArray(result)) {
    const out = [];
    for (let i = 0; i + 1 < result.length; i += 2) out.push([String(result[i]), result[i + 1]]);
    return out;
  }
  if (result && typeof result === 'object') return Object.entries(result);
  return [];
}

/**
 * createStore(env, opts) -> store | null
 *
 * Returns `null` — not a throwing stub, not a rejected promise — when no durable store is
 * configured. Callers branch on the null.
 *
 * store:
 *   kind     'kv'
 *   key      the Redis hash key in use
 *   host     the endpoint host, safe to print
 *   load()   -> { ok, records, reason? }
 *   put(rec) -> { ok, reason? }
 *   remove(id) -> { ok, reason? }
 *   ping()   -> { ok, count?, reason? }
 */
export function createStore(env = process.env, opts = {}) {
  const cfg = readStoreConfig(env);
  if (!cfg) return null;

  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null; // no fetch, no store — still not a crash

  /** Send one Redis command. Always resolves; never throws. */
  async function command(args) {
    let signal;
    try {
      signal = AbortSignal.timeout(cfg.timeoutMs);
    } catch {
      signal = undefined; // very old runtimes: run without a timeout rather than fail
    }
    try {
      const res = await fetchImpl(cfg.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args.map(String)),
        ...(signal ? { signal } : {}),
      });
      const text = await res.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        return { ok: false, reason: `store returned non-JSON (HTTP ${res.status})` };
      }
      if (!res.ok) {
        return { ok: false, reason: payload?.error ? String(payload.error) : `store HTTP ${res.status}` };
      }
      if (payload && payload.error) return { ok: false, reason: String(payload.error) };
      return { ok: true, result: payload?.result };
    } catch (err) {
      return { ok: false, reason: String(err?.message ?? err) };
    }
  }

  return {
    kind: 'kv',
    key: cfg.key,
    host: cfg.host,

    /** Read every record. A parse failure on one field skips that field, not the load. */
    async load() {
      const r = await command(['HGETALL', cfg.key]);
      if (!r.ok) return { ok: false, records: [], reason: r.reason };
      const records = [];
      for (const [, raw] of hashEntries(r.result)) {
        if (raw === null || raw === undefined) continue;
        if (typeof raw === 'object') {
          records.push(raw);
          continue;
        }
        try {
          const parsed = JSON.parse(String(raw));
          if (parsed && typeof parsed === 'object') records.push(parsed);
        } catch {
          /* one corrupt field must not take the whole catalog down */
        }
      }
      return { ok: true, records };
    },

    /**
     * Persist ONE record under its own hash field. The caller passes the record the
     * catalog actually stored (post-validation), never the raw request body — the store
     * must not become a way to smuggle a field past packages/index/src/integrity.mjs.
     */
    async put(record) {
      const id = record?.id;
      if (typeof id !== 'string' || id.length === 0) {
        return { ok: false, reason: 'record.id is required to persist a record' };
      }
      let json;
      try {
        json = JSON.stringify(record);
      } catch (err) {
        return { ok: false, reason: `record is not serialisable: ${String(err?.message ?? err)}` };
      }
      if (json.length > MAX_RECORD_BYTES) {
        return { ok: false, reason: `record exceeds ${MAX_RECORD_BYTES} bytes` };
      }
      const r = await command(['HSET', cfg.key, id, json]);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },

    async remove(id) {
      if (typeof id !== 'string' || id.length === 0) {
        return { ok: false, reason: 'id is required' };
      }
      const r = await command(['HDEL', cfg.key, id]);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },

    /** Cheap reachability probe for the health endpoint. */
    async ping() {
      const r = await command(['HLEN', cfg.key]);
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, count: Number(r.result) || 0 };
    },
  };
}

export default { createStore, readStoreConfig, DEFAULT_STORE_KEY };
