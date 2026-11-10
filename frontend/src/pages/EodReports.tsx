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

import { RefreshCw } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { showToast } from '@/utils/toast'
import BalanceProgressionTab from './eod-reports/BalanceProgressionTab'
import DailyChargesTab from './eod-reports/DailyChargesTab'
import TradeAnalysisTab from './eod-reports/TradeAnalysisTab'

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
