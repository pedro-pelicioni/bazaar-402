# Paste this into the GrantFox "Summary" field

---

## SEXTANT — find what to pay for on Stellar

**We did not build a payment demo. We built the piece that is missing from x402 on Stellar, and then built the payment demo around it so you can watch the missing piece work.**

### The gap

On Stellar, x402 **settlement is already solved** — `@x402/stellar` ships `verify` and `settle`, the `exact` spec is stable, and the SCF #45 RFP says so in plain language: *"settlement on Stellar is largely solved; the novel work is discovery."*

**Discovery is not solved.** And an agent that can pay but cannot discover is an agent with a wallet and no map.

- The `bazaar` extension spec defines `/discovery/resources` and `/discovery/search` — but it is only a spec.
- `@x402/extensions/bazaar` states **in its own README** that it ships only client and server helpers and **no facilitator-side catalog implementation**.
- `stellar/x402-stellar#50` — *"Explore Bazaar support for Stellar"* — has been **open and unassigned since April 2026**. The SDF repo's Dockerfile still reads `bazaar not used`.

SEXTANT is that missing catalog, plus the full vertical loop around it, live on `stellar:testnet`.

### Verify it in 60 seconds — every claim below is checkable

| Claim | How to check | Time |
|---|---|---|
| Payments really settle on Stellar | Open tx `c1acc578032a3a06a88603f971d871703f45b1246e0f1aa8862500495edbfba6` on stellar.expert → `successful: true` | 10s |
| The buyer needs **zero XLM** — fees are sponsored | On that tx, `fee_account` is the facilitator's fee payer, not the payer | 15s |
| Catalog integrity is real, not decorative | `npm test` → **70 passed, 0 failed** (66 adversarial) | 30s |
| **You can actually run it** | `npm install && npm run setup` — **no captcha, no faucet, no API key** | 2 min |

That last row is the one we would ask you to weigh. Nearly every x402-on-Stellar project needs a Circle faucet captcha **and** an OpenZeppelin Channels API key before it will start. This one needs neither.

### What we built

- **A facilitator-side Bazaar index** — spec-exact `/discovery/resources` and `/discovery/search`, BM25 hybrid ranking with a published formula and a per-result `_explain` breakdown, auto-cataloging from the discovery extension with no separate registration step, soft-drop validation, `EXTENSION-RESPONSES` reporting. Catalogs **HTTP endpoints and MCP tools side by side**, MCP keyed on the `(resource.url, input.toolName)` tuple as the spec requires.
- **A self-hosted x402 facilitator** on Apache-2.0 `@x402/stellar` — `extra.areFeesSponsored`, non-null reason on every rejection, no third-party dependency.
- **A paid seller API** declaring discovery metadata with per-parameter descriptions, so an agent can construct a valid call without reading docs.
- **An MCP server** — 4 tools with input *and* output schemas and a 17-code error enum, so an agent searches the catalog and pays from inside its runtime. Real settled payments were made through it.
- **A live console** rendering the catalog as a Sight Board with explainable ranking, an animated 402 → sign → settle → 200 loop, and a live catalog-integrity ledger.

### Two blockers removed by design

**No faucet.** We issue our own SEP-41 asset (`SXT`) and wrap it in a SAC — the Stellar `exact` scheme accepts any SEP-41 token, USDC is only the default. Setup runs start to finish with no web forms.

**No AGPL, no third-party facilitator.** Self-hosted on the Apache-2.0 package, removing the OpenZeppelin Relayer dependency, which is AGPL-3.0-or-later and unusable by any permissively licensed project. This is also RFP requirement 3.1's self-facilitation path.

### Three conformance findings

We built against the shipped code rather than the documentation. Reading the published `dist` turned up three places where the wire format moved and the surrounding material did not:

1. **x402 v2 uses `amount`, not `maxAmountRequired`**, and resource metadata moved to `PaymentRequired.resource`.
2. **v2 signs into `PAYMENT-SIGNATURE`, not `X-PAYMENT`** — `X-PAYMENT` is the v1 header, and is still what much of the surrounding documentation instructs.
3. **`@x402/core` accepts a body challenge only for v1.** A v2 resource server answering 402 with a JSON body — the natural reading — is unreachable by a stock client. Without the fallback we wrote, the paid loop was dead on arrival against our own seller.

The third is the class of defect that only surfaces when an unmodified client is pointed at an independent server, which is exactly the acceptance test the SCF #45 RFP specifies.

### Scope and honesty

Built against SCF #45, RFP Track — *"X402 Facilitator with Bazaar (discovery) support"* — which names the Bazaar discovery layer as the highest-value part of the scope. Components map to requirements 3.1, 3.2, 3.3 and 3.6.

**What we deliberately did not build:** no on-chain registry (the RFP itself calls it an optional stretch and explains the rent/TTL and doubled-settlement cost), no mainnet, no audit, and no `upto` implementation — that scheme has an active design discussion opened on 3 August 2026 that deserves a considered answer, not a rushed one.

Apache-2.0, public from the first commit. **11 settled testnet transactions, 70/70 tests passing.**

The point was not to win a weekend. It was to leave behind a piece of public infrastructure the Stellar ecosystem is currently missing, permissively licensed, that anyone can fork and run.
