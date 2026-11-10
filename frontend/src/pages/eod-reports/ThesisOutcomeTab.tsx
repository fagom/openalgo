/**
 * Does stating a thesis before firing a scalping order correlate with a
 * better outcome for this trader, compared to trades fired with none? Pure
 * comparison of the trader's own numbers (database.eod_reports_db.
 * get_thesis_outcome_stats) - not an AI judgment, and not a claim of
 * causation from a typically small sample.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

interface OutcomeBucket {
  tradeCount: number
  winRate: number
  totalPnl: number
  avgPnl: number
  verdictBreakdown: { good: number; neutral: number; poor: number; unrated: number }
}

interface ThesisStats {
  days: number
  withThesis: OutcomeBucket
  withoutThesis: OutcomeBucket
}

const DAY_OPTIONS = [7, 30, 90]

interface Props {
  /** Bumped by the page's Refresh button; triggers a reload when it changes. */
  refreshToken?: number
}

function OutcomeCard({
  title,
  bucket,
  formatCurrency,
}: {
  title: string
  bucket: OutcomeBucket
  formatCurrency: (v: number) => string
}) {
  const verdictTotal =
    bucket.verdictBreakdown.good +
    bucket.verdictBreakdown.neutral +
    bucket.verdictBreakdown.poor +
    bucket.verdictBreakdown.unrated

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{bucket.tradeCount} closed trade(s)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {bucket.tradeCount === 0 ? (
          <p className="text-sm text-muted-foreground">No trades in this window.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Win rate</p>
                <p className="text-lg font-semibold">{bucket.winRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total P&amp;L</p>
                <p
                  className={`text-lg font-semibold ${bucket.totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}
                >
                  {formatCurrency(bucket.totalPnl)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg P&amp;L / trade</p>
                <p
                  className={`text-lg font-semibold ${bucket.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`}
                >
                  {formatCurrency(bucket.avgPnl)}
                </p>
              </div>
            </div>
            {verdictTotal > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">AI reasoning verdicts</p>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  {bucket.verdictBreakdown.good > 0 && (
                    <div
                      className="bg-profit"
                      style={{ width: `${(bucket.verdictBreakdown.good / verdictTotal) * 100}%` }}
                    />
                  )}
                  {bucket.verdictBreakdown.neutral > 0 && (
                    <div
                      className="bg-muted-foreground/50"
                      style={{
                        width: `${(bucket.verdictBreakdown.neutral / verdictTotal) * 100}%`,
                      }}
                    />
                  )}
                  {bucket.verdictBreakdown.poor > 0 && (
                    <div
                      className="bg-loss"
                      style={{ width: `${(bucket.verdictBreakdown.poor / verdictTotal) * 100}%` }}
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bucket.verdictBreakdown.good} good &middot; {bucket.verdictBreakdown.neutral}{' '}
                  neutral &middot; {bucket.verdictBreakdown.poor} poor &middot;{' '}
                  {bucket.verdictBreakdown.unrated} not analyzed
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function ThesisOutcomeTab({ refreshToken = 0 }: Props) {
  const { user } = useAuthStore()
  const formatCurrency = makeFormatCurrency(user?.broker)
  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<ThesisStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (windowDays: number) => {
    try {
      const response = await fetch(`/eod-reports/api/thesis-stats?days=${windowDays}`, {
        credentials: 'include',
      })
      const result = await response.json()
      if (result.status !== 'success') {
        setError(result.message || 'Could not load thesis-vs-outcome stats')
        return
      }
      setError(null)
      setStats(result.data as ThesisStats)
    } catch {
      setError('Could not load thesis-vs-outcome stats')
    }
  }, [])

  useEffect(() => {
    load(days)
  }, [load, days, refreshToken])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Window</span>
        {DAY_OPTIONS.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={days === d ? 'default' : 'outline'}
            onClick={() => setDays(d)}
          >
            {d}d
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {stats && (
        <>
          <p className="text-sm text-muted-foreground">
            All closed trades over the last {stats.days} days, split by whether a thesis you typed
            into the scalping terminal's note box was attached to them. The thesis note only exists
            for scalping-terminal orders, so "Without thesis" also includes every trade placed
            elsewhere (strategies, the API, the trading terminal) - not only scalps fired without a
            note.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <OutcomeCard
              title="With thesis"
              bucket={stats.withThesis}
              formatCurrency={formatCurrency}
            />
            <OutcomeCard
              title="Without thesis"
              bucket={stats.withoutThesis}
              formatCurrency={formatCurrency}
            />
          </div>
        </>
      )}
    </div>
  )
}
