import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import type { MiniBar } from '@/components/dashboard/MiniCandles'
import { useAuthStore } from '@/stores/authStore'

interface HistoryBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

/** `YYYY-MM-DD` in the viewer's own timezone. */
function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** How many of the most recent bars the mini chart shows. */
const BAR_COUNT = 8
const REFRESH_MS = 60_000
/**
 * Calendar days to look back for bars, not trading days to show. A card asks
 * for "the most recent session with data," and today alone fails that on a
 * weekend, a holiday, or for a thinly traded contract with no prints yet
 * today -- the gap this covers is a long weekend plus a holiday on either
 * side of it, same margin `previousClose.ts` keeps for the same reason.
 */
const LOOKBACK_DAYS = 10

/**
 * The most recent `BAR_COUNT` 15-minute bars for one instrument, for the
 * dashboard's mini candle cards. Polls rather than streams: these cards say
 * "the last session went up or down," not "the current tick," so a
 * WebSocket subscription per card is not worth it -- useLiveQuote already
 * covers the live LTP those cards show next to the chart.
 */
export function useIntradayCandles(symbol: string, exchange: string) {
  const apiKey = useAuthStore((s) => s.apiKey)
  const [bars, setBars] = useState<MiniBar[]>([])

  useEffect(() => {
    if (!apiKey || !symbol || !exchange) {
      setBars([])
      return
    }
    let alive = true

    const fetchBars = async () => {
      try {
        const now = new Date()
        const start = localIso(new Date(now.getTime() - LOOKBACK_DAYS * 86400000))
        const res = await apiClient.post<{ status: string; data?: HistoryBar[] }>('/history', {
          apikey: apiKey,
          symbol,
          exchange,
          interval: '15m',
          start_date: start,
          end_date: localIso(now),
        })
        if (!alive) return
        const rows = res.data?.status === 'success' ? (res.data?.data ?? []) : []
        setBars(
          rows.slice(-BAR_COUNT).map(({ open, high, low, close }) => ({
            open,
            high,
            low,
            close,
          }))
        )
      } catch {
        // Quiet: the card falls back to its "No data" state.
      }
    }

    fetchBars()
    const interval = setInterval(fetchBars, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [apiKey, symbol, exchange])

  return bars
}
