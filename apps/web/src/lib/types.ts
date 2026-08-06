export type ResourceBlock = {
  url: string
  serviceName?: string
  tags?: string[]
  iconUrl?: string
  description?: string
}

export type SextantRecord = {
  id: string
  resource: ResourceBlock
  type: 'http' | 'mcp'
  network: string
  scheme: string
  payTo: string
  asset: string
  /** x402 v1 name for the price */
  maxAmountRequired: string
  /** x402 v2 name for the price — read both, render whichever is present */
  amount?: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  routeTemplate?: string
  extensions?: string[]
  lastSeenAt: number
  settlements: number
  /**
   * Marked by the index (and by the baked fixture) on illustrative catalog
   * entries. Absent means a real, payable, settle-backed resource.
   */
  seeded?: boolean
  /** attached client-side (or by the index) — why this lot ranked where it did */
  _explain?: Explain
}

export type Explain = {
  total: number
  parts: { key: ExplainKey; value: number; detail: string }[]
  terms: {
    term: string
    /** the field(s) the term hit — joined when the index reports several */
    field: string
    tf: number
    idf: number
    weight: number
    /**
     * Corpus-wide document frequency. Only the index knows this; the local
     * ranker sees one document at a time, so it is absent on the fallback path.
     */
    df?: number
  }[]
}

export type ExplainKey = 'bm25' | 'metadata' | 'settlements' | 'recency'

export type IntegrityEntry = {
  at: number
  verdict: 'rejected' | 'soft-drop'
  rule: string
  field: string
  input: string
  reason: string
}

export type TxEntry = { hash: string; label: string; source?: 'live' | 'demo' }

export type Source = 'live' | 'demo'

export type Catalog = {
  items: SextantRecord[]
  integrity: IntegrityEntry[]
  source: Source
  asset: string
  total: number
}
