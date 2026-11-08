import { useEffect, useState } from 'react'

interface SearchRow {
  symbol: string
  exchange: string
  name: string
  /** `DD-MON-YY`, e.g. `19-NOV-26`. */
  expiry: string
}

const MONTHS: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
}

/** `DD-MON-YY` as the search API sends it, not ISO -- Date.parse cannot be trusted with a 2-digit year. */
function parseExpiry(expiry: string): Date | null {
  const match = /^(\d{2})-([A-Z]{3})-(\d{2})$/.exec(expiry)
  if (!match) return null
  const month = MONTHS[match[2]]
  if (month === undefined) return null
  return new Date(2000 + Number(match[3]), month, Number(match[1]))
}

const cache = new Map<string, { symbol: string; exchange: string } | null>()

/**
 * Resolves a bare underlying name (`CRUDEOIL`, `GOLD`, ...) to its nearest
 * not-yet-expired futures contract on the given exchange.
 *
 * MCX has no continuous/spot symbol in the master contract -- only dated
 * futures (`CRUDEOIL20MAR28FUT`), and the near-month contract rolls every
 * few weeks, so it cannot be hardcoded. `instrumenttype=FUT` keeps the
 * symbol master's search endpoint from also matching the underlying's
 * thousands of option strikes; `expiry` comes back pre-parsed (`DD-MON-YY`)
 * so there is no need to extract a date from the contract symbol itself. An
 * index symbol (`NIFTY` on `NSE_INDEX`) is already directly quotable, so it
 * is returned unchanged rather than searched.
 */
export function useResolvedSymbol(symbol: string, exchange: string) {
  const [resolved, setResolved] = useState<{ symbol: string; exchange: string } | null>(
    exchange === 'MCX' ? null : { symbol, exchange }
  )

  useEffect(() => {
    if (exchange !== 'MCX') {
      setResolved({ symbol, exchange })
      return
    }

    const key = `${exchange}:${symbol}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      setResolved(cached)
      return
    }

    let alive = true
    ;(async () => {
      try {
        const params = new URLSearchParams({ q: symbol, exchange, instrumenttype: 'FUT' })
        const res = await fetch(`/search/api/search?${params}`, { credentials: 'include' })
        const data = await res.json()
        const rows: SearchRow[] = data.results ?? []

        const today = new Date()
        let best: { symbol: string; exchange: string; expiry: Date } | null = null
        for (const row of rows) {
          if (row.name !== symbol) continue
          const expiry = parseExpiry(row.expiry)
          if (!expiry || expiry < today) continue
          if (!best || expiry < best.expiry) {
            best = { symbol: row.symbol, exchange: row.exchange, expiry }
          }
        }

        const value = best ? { symbol: best.symbol, exchange: best.exchange } : null
        cache.set(key, value)
        if (alive) setResolved(value)
      } catch {
        cache.set(key, null)
        if (alive) setResolved(null)
      }
    })()

    return () => {
      alive = false
    }
  }, [symbol, exchange])

  return resolved
}
