import type { IntegrityEntry } from '../lib/types'

const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/**
 * The facilitator is a trust boundary, not a mailbox. This is the ledger of what
 * the index refused or stripped on the way in.
 */
export function IntegrityLedger({ entries }: { entries: IntegrityEntry[] }) {
  const rejected = entries.filter((e) => e.verdict === 'rejected').length
  return (
    <section className="plate" aria-labelledby="integrity-h">
      <header className="plate__cap">
        <span className="label" id="integrity-h">
          Catalog integrity
        </span>
        <span className="label" style={{ marginLeft: 'auto', color: 'var(--warn)' }}>
          {rejected} rejected / {entries.length - rejected} stripped
        </span>
      </header>
      <div className="ledger">
        {entries.length === 0 && (
          <p className="ledger__why" style={{ padding: '0.8rem 0' }}>
            Nothing refused yet in this window.
          </p>
        )}
        {entries.slice(0, 12).map((e, i) => (
          <article className="ledger__row" key={`${e.rule}-${i}`}>
            <time className="ledger__t" dateTime={new Date(e.at).toISOString()}>
              {clock(e.at)}
            </time>
            <div>
              <div>
                <span className={`verdict verdict--${e.verdict}`}>
                  {e.verdict === 'rejected' ? 'rejected' : 'soft-drop'}
                </span>
                <span className="ledger__rule">{e.rule}</span>
              </div>
              <code className="ledger__input">{e.input}</code>
              <p className="ledger__why">{e.reason}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
