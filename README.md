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

## Why this is not another paywall demo

The sub-lane brief offers five example builds. Four of them are variations on the same
thing: an agent paying for an API, a metered service, a channel-mode feed, a middleware kit.
They are good examples. They are also all built on ground that is **already solved** — the
RFP for SCF #45 says so in plain language: *"settlement on Stellar is largely solved; the
novel work is discovery, the agent facing interface, the upto scheme upstream, and
conformance that holds as the spec moves."*

So we did not build a payment demo. We built the part that is missing, and then built the
payment demo around it so you can see the missing part actually working.

**SEXTANT is scoped against [SCF #45, RFP Track — "X402 Facilitator with Bazaar (discovery)
support"](https://communityfund.stellar.org/), which names the Bazaar discovery layer as the
highest-value part of the scope and says it should carry the largest share of the budget.**
Every component below maps to a numbered requirement in that RFP, and the repository is
structured so each one can be pointed at directly:

| RFP requirement | What is in this repo | Status |
|---|---|---|
| **3.2 Bazaar discovery layer** — *"the core new capability"*, *"the hardest part of the scope"* | `packages/index` — spec-exact `/discovery/resources` and `/discovery/search`, BM25 hybrid ranking with a published formula and a per-result `_explain`, auto-cataloging from the discovery extension, soft-drop validation, `EXTENSION-RESPONSES` reporting | Working |
| **3.2 catalog integrity** — *"the facilitator is a trust boundary"* | 66 adversarial tests: `routeTemplate` traversal under single/double/triple percent-encoding, `iconUrl` SSRF evasion, tag flooding, external `$ref` | 66/66 passing |
| **3.1 Facilitator** — verify/settle/supported, fee sponsorship, self-facilitation | `apps/facilitator`, self-hosted on Apache-2.0 `@x402/stellar`, `extra.areFeesSponsored`, non-null reason on every rejection | Working, testnet |
| **3.3 Agent-facing MCP interface** | `apps/agent` — 4 MCP tools with input **and** output schemas, 17-code error enum | Working, settled payments |
| **3.6 Conformance** — *"drift, not inability, is the failure mode being screened for"* | Three wire-level divergences found by reading shipped code, documented below | Documented |
| **3.2 seller helpers** — per-parameter descriptions that make an endpoint legible to an agent | `apps/seller`, declared via `declareDiscoveryExtension` | Working |

What this is **not**, and deliberately so: no on-chain registry (the RFP calls it an optional
stretch and explains the rent/TTL cost), no mainnet, no audit, no `upto` implementation —
that scheme has [an active design discussion](https://github.com/stellar/x402-stellar/issues/72)
opened on 3 August 2026 that deserves a real answer rather than a rushed one.

The point is not to win a weekend. It is to leave behind a piece of public infrastructure
that the Stellar ecosystem is currently missing, licensed permissively, that anyone can fork
and run.

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
- **Accent-folding tokenization** — Unicode normalization strips diacritics before indexing,
  so a query matches regardless of how it is typed.
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

## Conformance findings

We built against the shipped code rather than the documentation, and reading the published
`dist` output turned up three places where the wire format has moved and the surrounding
material has not. All three are handled in this repo; all three are worth an upstream issue.

1. **x402 v2 `PaymentRequirements` uses `amount`, not `maxAmountRequired`.** Resource
   metadata also moved to `PaymentRequired.resource` as a `ResourceInfo`. The v1 layout is
   still what most examples show. Our facilitator and index read both shapes.
2. **v2 signs into the `PAYMENT-SIGNATURE` header, not `X-PAYMENT`.** `X-PAYMENT` is the v1
   header and is still what much of the surrounding documentation instructs. Our client sends
   both.
3. **`@x402/core` accepts a challenge in the JSON body only for v1.** For v2 it expects the
   `PAYMENT-REQUIRED` header. A v2 resource server that answers 402 with a body — which is
   the natural reading — is unreachable by a stock client. We added an `accepts`-array body
   fallback; without it the paid loop was dead on arrival against our own seller.

Point 3 in particular is the class of defect that only surfaces when an unmodified client is
pointed at an independent server, which is exactly the acceptance test the RFP specifies.

## Testnet transactions

Real hashes produced by this code, with explorer links: [`docs/TESTNET-TXS.md`](docs/TESTNET-TXS.md).

## License

Apache-2.0, public from the first commit.

---

<div align="center">
Built in São Paulo for Stellar Summit SP 2026.
</div>
