import { useEffect, useState } from 'react'
import { ASSET_CODE, testnetTxs } from '../lib/api'
import { explorerTx, formatAmount, shortHash, shortKey } from '../lib/format'
import type { SextantRecord } from '../lib/types'

const DURATIONS = [1100, 1200, 1500, 800]

/** deterministic pick so the same sight always shows the same settled tx */
function hashPick(id: string): string | undefined {
  if (!testnetTxs.length) return undefined
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return testnetTxs[h % testnetTxs.length]?.hash
}

/**
 * Traces one x402 round trip: 402 → sign → settle → 200.
 * The tx hash it lands on is a real settled testnet transaction.
 */
export function PaymentLoop({ rec, runId }: { rec: SextantRecord | null; runId: number }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (!rec) return
    setStage(0)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setStage(4)
      return
    }
    const timers: number[] = []
    let acc = 0
    DURATIONS.forEach((d, i) => {
      acc += d
      timers.push(window.setTimeout(() => setStage(i + 1), acc))
    })
    return () => timers.forEach(clearTimeout)
  }, [rec?.id, runId])

  if (!rec) {
    return (
      <section className="plate" aria-labelledby="loop-h">
        <header className="plate__cap">
          <span className="label" id="loop-h">
            Payment loop
          </span>
        </header>
        <p className="loop__empty">
          Pick a sight and press PAY.
          <br />
          One HTTP round trip: 402 → sign → settle → 200.
        </p>
      </section>
    )
  }

  const amount = formatAmount(rec.amount ?? rec.maxAmountRequired)
  const hash = hashPick(rec.id)
  const steps = [
    {
      title: 'Request',
      code: <span className="step__code code--402">402 PAYMENT REQUIRED</span>,
      note: `The seller answers with its terms instead of the goods.`,
      wire: `{ "x402Version": 2, "scheme": "exact",
  "network": "${rec.network}",
  "amount": "${rec.amount ?? rec.maxAmountRequired}",
  "asset": "${shortKey(rec.asset, 6, 6)}",
  "payTo": "${shortKey(rec.payTo, 6, 6)}" }`,
    },
    {
      title: 'Sign',
      code: <span className="step__code">auth entry</span>,
      note: 'The agent signs a Soroban authorization entry for exactly that amount. Network fees are sponsored by the facilitator, so the agent needs no XLM.',
      wire: `payer  ${shortKey(rec.payTo, 6, 6)}
value  ${amount} ${ASSET_CODE}
fees   sponsored (areFeesSponsored: true)`,
    },
    {
      title: 'Settle',
      code: <span className="step__code">POST /settle</span>,
      note: 'The facilitator verifies the entry and submits it to Stellar testnet.',
      wire: `POST http://localhost:4021/settle
→ verify  isValid: true
→ submit  stellar:testnet`,
    },
    {
      title: 'Deliver',
      code: <span className="step__code code--200">200 OK</span>,
      note: 'Same round trip, now with the response body — plus the settlement receipt in the header.',
      wire: `EXTENSION-RESPONSES: base64(
  { "bazaar": { "status": "success" } } )`,
    },
  ]

  return (
    <section className="plate" aria-labelledby="loop-h">
      <header className="plate__cap">
        <span className="label" id="loop-h">
          Payment loop
        </span>
        <span className="label" style={{ marginLeft: 'auto', color: 'var(--fg-3)' }}>
          {stage >= 4 ? 'settled' : `step ${Math.min(stage + 1, 4)} / 4`}
        </span>
      </header>

      <div className="loop">
        <p className="step__note" style={{ marginBottom: '0.9rem' }}>
          <strong style={{ color: 'var(--fg)' }}>{rec.resource.serviceName}</strong> · {amount}{' '}
          {ASSET_CODE}
        </p>

        <div className="loop__steps" aria-live="polite">
          {steps.map((s, i) => {
            const state = stage > i ? 'is-done' : stage === i ? 'is-active' : ''
            return (
              <div className={`step ${state}`} key={s.title}>
                <div className="step__mark">
                  <span className="step__dot" />
                </div>
                <div>
                  <div className="step__title">
                    <span>{s.title}</span>
                    {s.code}
                  </div>
                  <p className="step__note">{s.note}</p>
                  {(stage === i || stage > i) && <pre className="step__wire">{s.wire}</pre>}
                </div>
              </div>
            )
          })}
        </div>

        {stage >= 4 && (
          <div className="receipt">
            <div className="receipt__row">
              <span>settled</span>
              <b>
                {amount} {ASSET_CODE}
              </b>
            </div>
            <div className="receipt__row">
              <span>network</span>
              <b>{rec.network}</b>
            </div>
            <div className="receipt__row">
              <span>scheme</span>
              <b>{rec.scheme} · fees sponsored</b>
            </div>
            {hash ? (
              <a
                className="receipt__hash"
                href={explorerTx(hash)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {shortHash(hash)} ↗ stellar.expert
              </a>
            ) : (
              <p className="receipt__row">
                <span>tx</span>
                <b>pending</b>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
