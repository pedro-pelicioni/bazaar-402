# GrantFox — Stellar Summit SP 2026 · Sub-lane 3A submission text

**Repository:** https://github.com/pedro-pelicioni/bazaar-402

---

## SEXTANT — find what to pay for on Stellar

A sextant fixes your position by the stars. It does not move you — it tells you where you are
and what bearing to take. An agent holding money and an HTTP client has exactly that problem:
it can pay, but it cannot see what is out there to pay for.

On Stellar, x402 **settlement** is solved: the Apache-2.0 `@x402/stellar` package ships
`verify` and `settle` for the `exact` scheme, and the spec is stable. **Discovery is not.**

The `bazaar` extension spec defines `/discovery/resources` and `/discovery/search`, but the
upstream `@x402/extensions/bazaar` package states in its own README that it ships **only
client and server helpers and no facilitator-side catalog implementation**. On the Stellar
side, `stellar/x402-stellar#50` ("Explore Bazaar support for Stellar") has been **open and
unassigned since April 2026**, and the SDF repo's Dockerfile still carries the comment
`bazaar not used`.

SEXTANT builds that missing piece — and the whole loop around it, vertically integrated and
running end to end on `stellar:testnet`:

- **A facilitator-side Bazaar index** with spec-exact `/discovery/resources` and
  `/discovery/search`, real BM25 hybrid ranking with accent-folding tokenization, and a per-result
  `_explain` breakdown so you can see *why* a result ranked where it did.
- **A self-hosted x402 facilitator** built on Apache-2.0 `@x402/stellar`, sponsoring network
  fees so the paying agent needs zero XLM.
- **A paid seller API** declaring bazaar discovery metadata with per-parameter descriptions,
  auto-cataloged on settlement through the discovery extension — no separate registration
  step.
- **An MCP server** so an agent can search the catalog and make a paid call from inside its
  runtime, with structured outputs and a non-null reason on every rejection.
- **A live console and landing page** rendering results as a Sight Board, with the
  402 → sign → settle → 200 loop animated against real testnet transactions.

**Two blockers removed by design, not by shortcut.** Instead of depending on Circle's web
faucet for testnet USDC, SEXTANT **issues its own SEP-41 asset** — the Stellar `exact` spec
accepts any SEP-41 token, USDC is only the default — so `npm run setup` runs start to finish
with no web forms and no API keys. And instead of depending on the OpenZeppelin relayer
(**AGPL-3.0-or-later**, unusable for a permissively licensed project), the facilitator is
**self-hosted** on the Apache-2.0 package.

**The catalog is treated as a trust boundary.** Clients echo the `resource` block back inside
the payment payload, so every discovery field is attacker-controlled. The spec's normative
`routeTemplate` regex permits `%`, which means the `..` check must happen *after*
percent-decoding — including against double-encoding. That, plus `iconUrl` SSRF evasions and
the soft-drop survival invariant, is covered by an adversarial test suite in the repo.

Apache-2.0, public from the first commit. Testnet transaction hashes in `docs/TESTNET-TXS.md`.

```bash
npm install && npm run setup && npm run dev:all && npm run demo
```
