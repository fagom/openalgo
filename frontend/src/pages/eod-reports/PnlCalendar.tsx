/**
 * A GitHub-contribution-style calendar: one cell per trading day since Daily
 * Reports started recording data (no historical backfill), colored by that
 * day's total PnL - green shades for profit, red for loss, intensity scaled
 * to the biggest day in the window - plus the cumulative total alongside it.
 *
 * Reuses the app's own profit/loss tokens (--color-profit/--color-loss,
 * defined in index.css and already used by PnLTracker.tsx and the dashboard)
 * rather than a new palette, so a profitable day reads the same green
 * everywhere in the app. Intensity is layered with color-mix() instead of a
 * second ramp, which keeps it exactly on-token in both themes with no
 * separate dark-mode values to maintain.
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

interface PnlDay {
  date: string
  pnl: number
}

//: GitHub's own window - just over a year of weeks, so the grid reads as
//: "since I started" without needing its own date-range picker yet.
const WINDOW_DAYS = 371
const INTENSITY_STEPS = [0.18, 0.4, 0.62, 0.85, 1.0]

function cellColor(pnl: number, maxAbs: number): string {
  if (pnl === 0 || maxAbs === 0) return 'var(--muted)'
  const magnitude = Math.min(Math.abs(pnl) / maxAbs, 1)
  const step = INTENSITY_STEPS.find((s) => magnitude <= s) ?? 1
  const token = pnl > 0 ? 'var(--color-profit)' : 'var(--color-loss)'
  return `color-mix(in oklch, ${token} ${Math.round(step * 100)}%, var(--muted))`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function PnlCalendar({ refreshToken = 0 }: { refreshToken?: number }) {
  const { user } = useAuthStore()
  const formatCurrency = makeFormatCurrency(user?.broker)

  const [byDate, setByDate] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/eod-reports/api/pnl-calendar?days=${WINDOW_DAYS}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled) return
        if (result.status !== 'success') {
          setError(result.message || 'Could not load the P&L calendar')
          return
        }
        setByDate(new Map((result.data as PnlDay[]).map((d) => [d.date, d.pnl])))
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the P&L calendar')
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const { weeks, maxAbs, cumulative, firstDate } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(today)
    start.setDate(start.getDate() - (WINDOW_DAYS - 1))
    // Align the grid's first column to a Sunday, like GitHub's, so weeks
    // stack into clean columns.
    const gridStart = new Date(start)
    gridStart.setDate(gridStart.getDate() - gridStart.getDay())

    const days: { date: string; pnl: number }[] = []
    const cursor = new Date(gridStart)
    while (cursor <= today) {
      const key = isoDate(cursor)
      days.push({ date: key, pnl: byDate.get(key) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    const weeks: { date: string; pnl: number }[][] = []
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7))
    }

    const values = Array.from(byDate.values())
    const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    const cumulative = values.reduce((sum, v) => sum + v, 0)
    const sortedDates = Array.from(byDate.keys()).sort()
    const firstDate = sortedDates[0] ?? null

    return { weeks, maxAbs, cumulative, firstDate }
  }, [byDate])

  const monthLabels = useMemo(() => {
    const labels: { weekIndex: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((week, i) => {
      const d = new Date(week[0].date)
      if (d.getMonth() !== lastMonth) {
        labels.push({ weekIndex: i, label: d.toLocaleDateString('en-US', { month: 'short' }) })
        lastMonth = d.getMonth()
      }
    })
    return labels
  }, [weeks])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>P&amp;L Calendar</CardTitle>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Cumulative P&amp;L</p>
          <p className={`text-lg font-semibold ${cumulative >= 0 ? 'text-profit' : 'text-loss'}`}>
            {formatCurrency(cumulative)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {!error && byDate.size === 0 && (
          <p className="text-sm text-muted-foreground">
            No daily results yet. One cell is added for each trading day once its report runs.
          </p>
        )}
        {byDate.size > 0 && (
          <div className="overflow-x-auto">
            <div className="inline-flex flex-col gap-1">
              <div className="flex gap-[3px] pl-0 text-xs text-muted-foreground">
                {weeks.map((week, i) => {
                  const label = monthLabels.find((m) => m.weekIndex === i)
                  return (
                    <div key={week[0].date} className="w-[11px] shrink-0">
                      {label ? label.label : ''}
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((week) => (
                  <div key={week[0].date} className="flex flex-col gap-[3px]">
                    {week.map((day) => {
                      const hasData = byDate.has(day.date)
                      return (
                        <div
                          key={day.date}
                          title={
                            hasData
                              ? `${day.date}: ${formatCurrency(day.pnl)}`
                              : `${day.date}: no trades recorded`
                          }
                          className="size-[11px] rounded-[2px]"
                          style={{
                            backgroundColor: hasData ? cellColor(day.pnl, maxAbs) : 'var(--muted)',
                            opacity: hasData ? 1 : 0.4,
                          }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <span>Loss</span>
                {[1, 0.6, 0.3].map((v) => (
                  <div
                    key={`loss-${v}`}
                    className="size-[11px] rounded-[2px]"
                    style={{
                      backgroundColor: `color-mix(in oklch, var(--color-loss) ${Math.round(v * 100)}%, var(--muted))`,
                    }}
                  />
                ))}
                <div
                  className="size-[11px] rounded-[2px]"
                  style={{ backgroundColor: 'var(--muted)' }}
                />
                {[0.3, 0.6, 1].map((v) => (
                  <div
                    key={`profit-${v}`}
                    className="size-[11px] rounded-[2px]"
                    style={{
                      backgroundColor: `color-mix(in oklch, var(--color-profit) ${Math.round(v * 100)}%, var(--muted))`,
                    }}
                  />
                ))}
                <span>Profit</span>
              </div>
              {firstDate && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tracking since {firstDate} - no history before this page was turned on.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
