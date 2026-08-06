export type ResourceBlock = {
  url: string
  serviceName?: string
  tags?: string[]
  iconUrl?: string
  description?: string
}

export type PregaoRecord = {
  id: string
  resource: ResourceBlock
  type: 'http' | 'mcp'
  network: string
  scheme: string
  payTo: string
  asset: string
  maxAmountRequired: string
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  routeTemplate?: string
  extensions?: string[]
  lastSeenAt: number
  settlements: number
  /** attached client-side (or by the index) — why this lot ranked where it did */
  _explain?: Explain
}

export type Explain = {
  total: number
  parts: { key: ExplainKey; value: number; detail: string }[]
  terms: { term: string; field: string; tf: number; idf: number; weight: number }[]
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
  items: PregaoRecord[]
  integrity: IntegrityEntry[]
  source: Source
  asset: string
  total: number
}
