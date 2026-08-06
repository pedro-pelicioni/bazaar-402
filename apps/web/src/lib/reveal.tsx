import { Fragment, useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * Scroll-triggered reveal, done with one shared IntersectionObserver.
 *
 * The mechanism is the one every "in view" component on 21st.dev uses under its
 * animation library: observe the block, and when it is *meaningfully* on screen
 * — not the instant its first pixel crosses the fold — flip it from a hidden to
 * a visible state and stop observing. The negative bottom root margin is what
 * buys the "meaningfully"; without it, blocks animate while still under the
 * fold and the reader never sees the motion.
 *
 * Everything past that point is CSS (see base.css): the observer only sets
 * `data-in`, and descendants stagger off their own `--i`. No scroll listener,
 * no per-frame work, nothing to clean up but the observer entry.
 */

/* Armed only once JS is running. Without this the hidden state would be baked
   into the stylesheet and a failed bundle would leave a blank page. */
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-reveal', 'on')
}

let io: IntersectionObserver | null = null

function observer(): IntersectionObserver {
  if (io) return io
  io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.setAttribute('data-in', '')
        io?.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0 },
  )
  return io
}

/** Ref for a block whose descendants should reveal when it scrolls into view. */
export function useReveal<T extends Element>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // No IntersectionObserver (or a very old engine): show everything at once.
    if (typeof IntersectionObserver === 'undefined') {
      el.setAttribute('data-in', '')
      return
    }
    const obs = observer()
    obs.observe(el)
    return () => obs.unobserve(el)
  }, [])
  return ref
}

/** A plain block that arms its `.rise` descendants when it scrolls into view. */
export function RevealGroup({
  className,
  children,
  style,
  id,
}: {
  className?: string
  children: ReactNode
  style?: CSSProperties
  id?: string
}) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} className={className} style={style} id={id}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ headings */

type Run = { text: string; em: boolean }

/**
 * Split a heading into words so each can carry its own delay — the text-reveal
 * technique, reduced to its useful core. Emphasis is marked with asterisks so
 * the copy stays readable in the JSX: `Four steps, *one* round trip.`
 *
 * Splitting happens per word but tracks emphasis per character run, so
 * `*what exists*.` keeps the full stop outside the italic, exactly as the
 * hand-written `<em>` did.
 */
function tokenize(text: string): Run[][] {
  const words: Run[][] = []
  let em = false
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue
    const runs: Run[] = []
    let buf = ''
    for (const ch of raw) {
      if (ch === '*') {
        if (buf) runs.push({ text: buf, em })
        buf = ''
        em = !em
      } else {
        buf += ch
      }
    }
    if (buf) runs.push({ text: buf, em })
    words.push(runs)
  }
  return words
}

/**
 * The rendered text is identical to writing it inline — real text nodes, real
 * spaces, real `<em>`. Screen readers and text selection are unaffected; the
 * only addition is an inline-block wrapper per word carrying its index.
 */
export function SplitLine({ text, from = 0 }: { text: string; from?: number }) {
  const words = tokenize(text)
  return (
    <>
      {words.map((runs, i) => (
        <Fragment key={i}>
          <span className="rise wd" style={{ '--i': from + i } as CSSProperties}>
            {runs.map((r, j) =>
              r.em ? <em key={j}>{r.text}</em> : <Fragment key={j}>{r.text}</Fragment>,
            )}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  )
}
