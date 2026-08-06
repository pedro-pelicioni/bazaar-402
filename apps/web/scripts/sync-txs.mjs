// Pulls real testnet tx hashes out of docs/TESTNET-TXS.md (written by another agent)
// into src/data/testnet-txs.json. Never fails the build: always exits 0.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../src/data/testnet-txs.json')
const doc = resolve(here, '../../../docs/TESTNET-TXS.md')

try {
  if (!existsSync(doc)) {
    console.log('[sync-txs] docs/TESTNET-TXS.md not present — keeping current data')
    process.exit(0)
  }
  const md = readFileSync(doc, 'utf8')
  const seen = new Set()
  const rows = []
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    const m = line.match(/\b([a-fA-F0-9]{64})\b/)
    if (!m) continue
    const hash = m[1].toLowerCase()
    if (seen.has(hash)) continue
    seen.add(hash)
    // label = whatever human text sits on the line, minus the hash and md noise
    let label = line
      .replace(m[1], '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[|`*_>#\[\]()-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (label.length > 64) label = label.slice(0, 64).trim()
    rows.push({ hash, label: label || 'settlement', source: 'live' })
  }
  if (!rows.length) {
    console.log('[sync-txs] no 64-hex hashes found — keeping current data')
    process.exit(0)
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(rows, null, 2) + '\n')
  console.log(`[sync-txs] wrote ${rows.length} tx hash(es)`)
} catch (err) {
  console.log('[sync-txs] skipped:', err && err.message)
}
process.exit(0)
