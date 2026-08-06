# PREGÃO — Integration Contract (read this first)

Monorepo, plain npm workspaces, Node 22, ESM (`"type": "module"`). No TypeScript build step
anywhere except `apps/web` (Vite). Everything must run with `node <file>.mjs` or `npm run dev`.

Deadline is hard. Prefer WORKING over COMPLETE. Never leave a broken import.

## Ports (fixed, do not change)

| Service | Port | Owner |
|---|---|---|
| facilitator (`/verify`, `/settle`, `/supported`) | 4021 | apps/facilitator |
| bazaar index (`/discovery/*`) | 4022 | packages/index served by apps/facilitator |
| seller paid API | 4023 | apps/seller |
| web (Vite dev) | 5173 | apps/web |

## Shared env — `/.env` at repo root (written by scripts/setup-testnet.mjs)

```
STELLAR_NETWORK=stellar:testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015

ISSUER_SECRET=S...        # issues the PREGO SEP-41 test asset
ISSUER_PUBLIC=G...
ASSET_CODE=PREGO
ASSET_SAC=C...            # SAC contract id — this is `asset` in PaymentRequirements

SELLER_SECRET=S...        # payTo account (has PREGO trustline)
SELLER_PUBLIC=G...

PAYER_SECRET=S...         # the agent's wallet (has PREGO trustline + balance)
PAYER_PUBLIC=G...

FEEPAYER_SECRET=S...      # facilitator sponsors network fees (RFP 3.1 areFeesSponsored)
FEEPAYER_PUBLIC=G...

FACILITATOR_URL=http://localhost:4021
INDEX_URL=http://localhost:4022
SELLER_URL=http://localhost:4023
```

## packages/index — public API (ESM named exports from `packages/index/src/index.mjs`)

```js
export function createCatalog()                    // -> Catalog
// Catalog:
//   upsert(record) -> { ok: boolean, dropped: string[], reason?: string }
//   list({ type, payTo, scheme, network, extensions, limit=20, offset=0 }) -> { items, total, limit, offset }
//   search({ query, limit=20, cursor, ...filters }) -> { items, partialResults, pagination:{limit,cursor} }
//   size() -> number
export function validateResourceBlock(block)       // soft-drop -> { value, dropped: string[] }
export function validateRouteTemplate(t)           // -> { valid: boolean, reason?: string }
export function scoreHybrid(query, docs)           // BM25 + field-boost -> ranked docs
```

`record` shape (canonical — everyone uses this exact shape):

```js
{
  id: string,                 // `${resource.url}` or `${resource.url}#${input.toolName}` for MCP
  resource: { url, serviceName?, tags?, iconUrl?, description? },
  type: "http" | "mcp",
  network: "stellar:testnet",
  scheme: "exact",
  payTo: "G...",
  asset: "C...",
  maxAmountRequired: "10000",
  input: { type, method?, queryParams?, body?, toolName?, inputSchema? },
  output: { type, format?, example? },
  routeTemplate?: string,
  extensions: ["bazaar"],
  lastSeenAt: number,         // ms epoch
  settlements: number         // count of observed settled payments
}
```

## HTTP surfaces (spec-exact — do not rename fields)

- `GET  /supported` -> `{ kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet", extra: { areFeesSponsored: true, asset } }] }`
- `POST /verify`  -> `{ isValid, invalidReason|null, payer }`
- `POST /settle`  -> `{ success, errorReason|null, transaction, network, payer }` + header `EXTENSION-RESPONSES`
- `GET  /discovery/resources?type&payTo&scheme&network&extensions&limit&offset`
- `GET  /discovery/search?query&limit&cursor&...filters` -> includes `partialResults` + `pagination{limit,cursor}`
- `EXTENSION-RESPONSES` header = base64(JSON) of `{ bazaar: { status: "success"|"processing"|"rejected", rejectedReason? } }`

## apps/web contract

Reads from `INDEX_URL`. **MUST render fully with a baked-in fallback fixture** at
`apps/web/src/data/fixture.json` when the API is unreachable — the demo cannot depend on
localhost being up. Show a small "LIVE / DEMO" pill reflecting which source is active.

Routes: `/` (landing), `/console` (live search + payment loop viewer).

## Assets

Generated assets land in `apps/web/public/assets/`. Web must degrade gracefully (CSS-only
fallback) if an asset file is missing.
