/**
 * Line chart of the account's end-of-day net balance (available cash +
 * collateral), one point per day since the EOD job started running. Drawn
 * with openalgo-charts, the same engine PnLTracker.tsx uses, so the look and
 * theme behaviour match the rest of the app's read-only charts.
 */

import { type Chart, createChart, type SeriesApi } from 'openalgo-charts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buildChartTheme } from '@/lib/trading/chartTheme'
import { makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

interface BalancePoint {
  date: string
  netBalance: number | null
  availableCash: number | null
  collateral: number | null
}

const CHART_HEIGHT = 360

interface Props {
  /** Bumped by the page's Refresh button; triggers a reload when it changes. */
  refreshToken?: number
}

export default function BalanceProgressionTab({ refreshToken = 0 }: Props) {
  const mode = useThemeStore((state) => state.mode)
  const appMode = useThemeStore((state) => state.appMode)
  const { user } = useAuthStore()
  const formatCurrency = makeFormatCurrency(user?.broker)

  const [points, setPoints] = useState<BalancePoint[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const seriesRef = useRef<SeriesApi | null>(null)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    const chart = createChart(host, {
      theme: buildChartTheme(mode, appMode),
      ariaLabel: 'Account balance progression',
      shortcuts: false,
      timeNavigator: false,
    })
    const series = chart.addSeries('line', {
      priceScaleId: 'right',
      priceFormat: { type: 'custom', formatter: (price: number) => formatCurrency(price) },
      style: { lineWidth: 2, title: 'Net balance', lastValueVisible: true, priceLineVisible: true },
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.destroy()
      host.innerHTML = ''
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chartRef.current?.setTheme(buildChartTheme(mode, appMode))
  }, [mode, appMode])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch('/eod-reports/api/balance-progression?days=90', {
        credentials: 'include',
      })
      const result = await response.json()
      if (result.status !== 'success') {
        throw new Error(result.message || 'Could not load balance history')
      }
      const data: BalancePoint[] = (result.data || []).map((row: any) => ({
        date: row.date,
        netBalance: row.netBalance,
        availableCash: row.availableCash,
        collateral: row.collateral,
      }))
      setPoints(data)
      if (seriesRef.current && data.length) {
        seriesRef.current.setData(
          data
            .filter((row) => row.netBalance !== null)
            .map((row) => ({
              time: Math.floor(new Date(`${row.date}T00:00:00Z`).getTime() / 1000),
              value: row.netBalance as number,
            }))
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load balance history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshToken])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Balance Progression</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {!isLoading && points.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              No balance history yet. The first snapshot is taken after today's market close.
            </p>
          )}
          <div ref={containerRef} style={{ height: CHART_HEIGHT, width: '100%' }} />
        </CardContent>
      </Card>
    </div>
  )
}
