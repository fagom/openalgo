/**
 * Week-over-week or month-over-month trade-performance trend, one point per
 * period (database.eod_reports_db.get_trade_analysis_trend) - recomputed
 * from each period's summed trade/win/loss counts, not an average of each
 * day's own win rate, so a single-trade day never carries the same weight
 * as a thirty-trade day.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

interface TrendPoint {
  periodStart: string
  label: string
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnl: number
  profitFactor: number | null
}

interface Props {
  /** Bumped by the page's Refresh button; triggers a reload when it changes. */
  refreshToken?: number
}

const PERIOD_OPTIONS: Array<{ value: 'week' | 'month'; label: string }> = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

export default function TrendTab({ refreshToken = 0 }: Props) {
  const { user } = useAuthStore()
  const formatCurrency = makeFormatCurrency(user?.broker)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [points, setPoints] = useState<TrendPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: 'week' | 'month') => {
    try {
      const response = await fetch(`/eod-reports/api/trend?period=${p}&periods=12`, {
        credentials: 'include',
      })
      const result = await response.json()
      if (result.status !== 'success') {
        setError(result.message || 'Could not load the trend')
        return
      }
      setError(null)
      setPoints(result.data as TrendPoint[])
    } catch {
      setError('Could not load the trend')
    }
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period, refreshToken])

  const maxAbsPnl = points.reduce((m, p) => Math.max(m, Math.abs(p.totalPnl)), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={period === opt.value ? 'default' : 'outline'}
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{period === 'week' ? 'Weekly' : 'Monthly'} Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {points.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No trade history yet. Each period's point appears once at least one day in it has a
              closed-trade report.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{period === 'week' ? 'Week of' : 'Month'}</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Profit Factor</TableHead>
                  <TableHead className="text-right">P&amp;L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {points.map((p) => (
                  <TableRow key={p.periodStart}>
                    <TableCell className="font-medium">{p.label}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.totalTrades} ({p.winningTrades}W/{p.losingTrades}L)
                    </TableCell>
                    <TableCell className="text-right font-mono">{p.winRate}%</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.profitFactor !== null ? p.profitFactor.toFixed(2) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          {maxAbsPnl > 0 && (
                            <div
                              className={cn('h-full', p.totalPnl >= 0 ? 'bg-profit' : 'bg-loss')}
                              style={{ width: `${(Math.abs(p.totalPnl) / maxAbsPnl) * 100}%` }}
                            />
                          )}
                        </div>
                        <span
                          className={cn(
                            'w-24 font-mono font-medium',
                            p.totalPnl >= 0 ? 'text-profit' : 'text-loss'
                          )}
                        >
                          {p.totalPnl >= 0 ? '+' : ''}
                          {formatCurrency(p.totalPnl)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
