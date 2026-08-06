<div align="center">

# SEXTANT

**Find what to pay for on Stellar.**

Discovery for the x402 economy — the facilitator-side Bazaar index, and the whole loop around it.

`Apache-2.0` · `stellar:testnet` · Stellar Summit SP 2026 — sub-lane 3A, Agentic Payments (x402 / MPP)

</div>

---

> A **sextant** fixes your position by the stars. It does not move you — it tells you where
> you are and what bearing to take. An agent holding money and an HTTP client has the same
> problem: it can pay, but it cannot yet see what is out there to pay for.

## The problem

On Stellar, x402 **settlement** is solved. The Apache-2.0 [`@x402/stellar`](https://www.npmjs.com/package/@x402/stellar)
package (v2.21.0, published 4 Aug 2026) ships `verify` and `settle` for the `exact` scheme,
[`scheme_exact_stellar.md`](https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_stellar.md)
is stable, and the SDF publishes a reference facilitator.

**Discovery is not.** And without discovery, an agent has no way to know *what* to pay for.

- The [`bazaar` extension spec](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md)
  defines `/discovery/resources` and `/discovery/search` — but it is only a spec.
- The upstream `@x402/extensions/bazaar` package states in its own README that it ships
  **only client and server helpers, and no facilitator-side catalog implementation**.
- [`stellar/x402-stellar#50` — *Explore Bazaar support for Stellar*](https://github.com/stellar/x402-stellar/issues/50)
  has been **open and unassigned since April 2026**. The SDF repo's Dockerfile still carries
  the comment `bazaar not used`.

**SEXTANT builds the missing piece** — and the entire loop around it, vertically integrated
and running end to end on `stellar:testnet`.

## Architecture

```
 seller ──declares metadata──►  SEXTANT INDEX  ◄──natural-language search──  agent
    │                                ▲                                          │
    │                                │ auto-cataloged on settle (bazaar ext)    │
    └──────────►  SELF-HOSTED FACILITATOR  ◄────── 402 → sign → settle ─────────┘
                            │
                      stellar:testnet
```

| Component | What it is | SCF #45 RFP requirement |
|---|---|---|
| `packages/index` | Catalog + BM25 hybrid search with explainable ranking, plus catalog-integrity validation | **3.2** — the RFP's highest-value scope |
| `apps/facilitator` | **Self-hosted** x402 facilitator on `@x402/stellar`, sponsoring network fees | **3.1** |
| `apps/seller` | Paid API declaring discovery metadata with per-parameter descriptions | **3.2** — seller helpers |
| `apps/agent` | MCP server + client: discover → 402 → pay → consume | **3.3** |
| `apps/web` | Landing page + live console with the Sight Board and the payment loop | — |
| `test/` | Adversarial catalog-poisoning suite | **3.2** integrity, **3.6** conformance |

## Two blockers removed by design

This was built in a single afternoon. The two things that normally stall an x402 setup on
Stellar were eliminated — not by shortcut, but by decisions that are also architecturally
better:

**1. No faucet, no captcha.** Rather than depending on Circle's web faucet for testnet USDC,
SEXTANT **issues its own SEP-41 asset** (`SXT`) and wraps it in a SAC. The Stellar `exact`
scheme accepts any SEP-41 token — USDC is only the default. `npm run setup` therefore runs
start to finish with no web forms and no API keys.

**2. No third-party facilitator.** The facilitator is **self-hosted**, built on the
Apache-2.0 package. That removes any dependency on the OpenZeppelin Relayer / OZ Channels —
which is **AGPL-3.0-or-later**, and therefore unusable by any project that needs a permissive
license — while demonstrating the self-facilitation path the RFP asks for in 3.1.

The `FEEPAYER` account sponsors network fees, so the paying agent needs **zero XLM**.

## Running it

```bash
npm install
npm run setup      # generates accounts, issues the SXT asset, adds trustlines — all testnet
npm run dev:all    # facilitator :4021 · index :4022 · seller :4023 · web :5173
npm run demo       # full loop: discover → 402 → sign → settle → 200
```

No API keys. No captcha. No mainnet. No real money.

## Search ranking

The SCF #45 RFP states that search quality is the hardest part of the scope and the part
existing catalogs most often leave unimplemented. We agree — so the ranking here is not a
`.includes()` filter:

- **BM25** (k1=1.2, b=0.75) over a field-weighted document: service name, description, tags,
  parameter names and their per-parameter descriptions, output format, URL path segments.
- **Bilingual tokenization** — accent folding plus Portuguese and English stopword sets, so a
  catalog of LatAm services is retrievable in either language.
- **A quality signal** — metadata completeness, `log1p(settlements)`, and recency decay.
- **Per-result `_explain`** — the console shows *why* each result ranked where it did.

The honest cold-start problem and the proposed evaluation method (nDCG@10, Recall@20, MRR
over a labeled query set) are written up in [`docs/SEARCH-QUALITY.md`](docs/SEARCH-QUALITY.md).

## Catalog integrity

The facilitator is a **trust boundary**. Clients echo the `resource` block back inside the
payment payload, so every discovery field is attacker-controlled. We implement the spec's
soft-drop rules and test them adversarially:

- **`routeTemplate`** — the normative regex `^/[a-zA-Z0-9_/:.\-~%]+$` **permits `%`**, so the
  `..` check must run **after percent-decoding**, including against double-encoding
  (`%252e%252e`). Tested.
- **`iconUrl`** — SSRF evasions: `127.0.0.1`, decimal `2130706433`, `[::1]`, `0.0.0.0`,
  `data:`. Tested.
- **`serviceName` / `tags`** — control characters, length caps, case-insensitive dedupe, and
  the invariant that matters: **an invalid field is dropped, the surrounding metadata
  survives**. Tested.

```bash
npm test
```

## Testnet transactions

Real hashes produced by this code, with explorer links: [`docs/TESTNET-TXS.md`](docs/TESTNET-TXS.md).

## License

Apache-2.0, public from the first commit.

---

<div align="center">
Built in São Paulo for Stellar Summit SP 2026.
</div>
