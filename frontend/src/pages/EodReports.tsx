/**
 * Daily Reports: balance progression, daily charges, trade analysis and
 * per-trade AI reasoning.
 *
 * Data starts from the day this feature is deployed - there is no historical
 * backfill - and is computed automatically by the backend's EOD job
 * (services/eod_reports_service.py), twice a day: equity/F&O at 15:40 IST,
 * commodities at 23:45 IST (MCX trades into the evening). The page's own
 * Refresh button runs both so a click here never leaves one market class
 * stale relative to the other.
 */

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { showToast } from '@/utils/toast'
import BalanceProgressionTab from './eod-reports/BalanceProgressionTab'
import DailyChargesTab from './eod-reports/DailyChargesTab'
import TradeAnalysisTab from './eod-reports/TradeAnalysisTab'

const MARKET_CLASS_LABEL: Record<string, string> = {
  equity_fo: 'Equity/F&O',
  commodity: 'Commodity',
}

interface ReportStatus {
  due: boolean
  generated: boolean
}

async function fetchCSRFToken(): Promise<string> {
  const response = await fetch('/auth/csrf-token', { credentials: 'include' })
  const data = await response.json()
  return data.csrf_token
}

export default function EodReports() {
  const [tab, setTab] = useState('balance')
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Bumped after a successful manual refresh so every tab refetches. The
  // scheduled 15:40 IST job writes the same rows (both paths are upserts, see
  // services/eod_reports_service.py), so a manual refresh here and tonight's
  // automatic run never conflict - the later one just wins.
  const [refreshToken, setRefreshToken] = useState(0)
  // Which market classes are past their scheduled run time with no report
  // for today yet -- most likely nobody was logged in when the job ran.
  const [missing, setMissing] = useState<string[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an intentional re-fetch trigger after a manual refresh, not read in the body
  useEffect(() => {
    let cancelled = false
    fetch('/eod-reports/api/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (cancelled || res.status !== 'success') return
        const data = res.data as Record<string, ReportStatus>
        setMissing(
          Object.entries(data)
            .filter(([, s]) => s.due && !s.generated)
            .map(([marketClass]) => marketClass)
        )
      })
      .catch(() => {
        // Silent: a missing-report banner is a convenience, not critical path.
      })
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const refreshNow = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const csrfToken = await fetchCSRFToken()
      // Both market classes, so a single click never leaves one stale - the
      // commodity run is a no-op (empty day) for a trader who doesn't trade
      // MCX, same as if its 23:45 IST scheduled run found nothing.
      const results = await Promise.all(
        (['equity_fo', 'commodity'] as const).map((marketClass) =>
          fetch('/eod-reports/api/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
            credentials: 'include',
            body: JSON.stringify({ market_class: marketClass }),
          }).then((r) => r.json())
        )
      )
      const failed = results.find((r) => r.status !== 'ok')
      if (failed) {
        throw new Error(failed.message || 'Could not refresh today’s reports')
      }
      setRefreshToken((prev) => prev + 1)
      showToast.success('Today’s reports are up to date.')
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Could not refresh today’s reports')
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  return (
    <div className="container mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Daily Reports</h1>
          <p className="text-sm text-muted-foreground">
            Balance progression, daily charges and trade analysis, one entry per trading day since
            this page was turned on. Updates automatically after market close; use Refresh to see
            today's numbers now.
          </p>
        </div>
        <Button variant="outline" onClick={refreshNow} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {missing.length > 0 && (
        <Alert variant="default" className="mb-4 bg-warning/10 border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            No {missing.map((m) => MARKET_CLASS_LABEL[m] ?? m).join(' or ')} report for today yet
            &mdash; you probably weren't logged in to your broker when it was due to run. Click
            Refresh to generate it now.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="balance">Balance Progression</TabsTrigger>
          <TabsTrigger value="charges">Daily Charges</TabsTrigger>
          <TabsTrigger value="analysis">Trade Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="balance">
          <BalanceProgressionTab refreshToken={refreshToken} />
        </TabsContent>
        <TabsContent value="charges">
          <DailyChargesTab refreshToken={refreshToken} />
        </TabsContent>
        <TabsContent value="analysis">
          <TradeAnalysisTab refreshToken={refreshToken} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
