/**
 * Per-segment breakdown of a day's statutory trading costs (STT, stamp duty,
 * exchange transaction charge, SEBI fee, GST) plus the trader's own
 * brokerage rate, computed by the backend's EOD job
 * (services/charges/charges_calculator.py) since no broker API here reports
 * a clean breakdown.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { showToast } from '@/utils/toast'

async function fetchCSRFToken(): Promise<string> {
  const response = await fetch('/auth/csrf-token', { credentials: 'include' })
  const data = await response.json()
  return data.csrf_token
}

interface ChargeRow {
  segment: string
  tradeCount: number
  turnover: number
  brokerage: number
  stt: number
  stampDuty: number
  exchangeTxnCharge: number
  sebiFee: number
  gst: number
  totalCharges: number
}

interface BrokerageRates {
  equity_delivery: number
  equity_intraday: number
  fo_futures: number
  fo_options: number
  commodity_futures: number
  commodity_options: number
}

const SEGMENT_LABELS: Record<string, string> = {
  equity_delivery: 'Equity Delivery',
  equity_intraday: 'Equity Intraday',
  fo_futures: 'F&O Futures',
  fo_options: 'F&O Options',
  commodity_futures: 'Commodity Futures',
  commodity_options: 'Commodity Options',
}

const RATE_FIELDS: Array<{ key: keyof BrokerageRates; label: string }> = [
  { key: 'equity_delivery', label: 'Equity Delivery (Rs/order)' },
  { key: 'equity_intraday', label: 'Equity Intraday (Rs/order)' },
  { key: 'fo_futures', label: 'F&O Futures (Rs/order)' },
  { key: 'fo_options', label: 'F&O Options (Rs/order)' },
  { key: 'commodity_futures', label: 'Commodity Futures (Rs/order)' },
  { key: 'commodity_options', label: 'Commodity Options (Rs/order)' },
]

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  /** Bumped by the page's Refresh button; triggers a reload when it changes. */
  refreshToken?: number
}

export default function DailyChargesTab({ refreshToken = 0 }: Props) {
  const { user } = useAuthStore()
  const formatCurrency = makeFormatCurrency(user?.broker)

  const [marketClass, setMarketClass] = useState<'equity_fo' | 'commodity'>('equity_fo')
  const [date, setDate] = useState(todayIso())
  const [rows, setRows] = useState<ChargeRow[]>([])
  const [rates, setRates] = useState<BrokerageRates>({
    equity_delivery: 0,
    equity_intraday: 0,
    fo_futures: 0,
    fo_options: 0,
    commodity_futures: 0,
    commodity_options: 0,
  })
  const [savingRates, setSavingRates] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCharges = useCallback(async (forDate: string, forClass: string) => {
    setError(null)
    try {
      const response = await fetch(
        `/eod-reports/api/daily-charges?date=${forDate}&market_class=${forClass}`,
        { credentials: 'include' }
      )
      const result = await response.json()
      if (result.status !== 'success') throw new Error(result.message || 'Could not load charges')
      setRows(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load charges')
    }
  }, [])

  useEffect(() => {
    loadCharges(date, marketClass)
  }, [date, marketClass, loadCharges, refreshToken])

  useEffect(() => {
    fetch('/eod-reports/api/brokerage-settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((result) => {
        if (result.status === 'success' && result.data) setRates(result.data)
      })
      .catch(() => {})
  }, [])

  const saveRates = useCallback(async () => {
    setSavingRates(true)
    try {
      const csrfToken = await fetchCSRFToken()
      const response = await fetch('/eod-reports/api/brokerage-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        credentials: 'include',
        body: JSON.stringify(rates),
      })
      const result = await response.json()
      if (result.status !== 'success') throw new Error(result.message || 'Could not save rates')
      showToast.success("Brokerage rates saved. They apply from tonight's report onward.")
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Could not save brokerage rates')
    } finally {
      setSavingRates(false)
    }
  }, [rates])

  const grandTotal = rows.reduce((sum, row) => sum + row.totalCharges, 0)

  return (
    <div className="space-y-4">
      <Tabs value={marketClass} onValueChange={(v) => setMarketClass(v as typeof marketClass)}>
        <TabsList>
          <TabsTrigger value="equity_fo">Equity & F&O</TabsTrigger>
          <TabsTrigger value="commodity">Commodities</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Brokerage Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            OpenAlgo places orders directly with your broker, so brokerage depends on your own plan
            and is not something any broker reports back. Enter what your broker actually charges
            per executed order; it is applied to tonight's report onward.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {RATE_FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="number"
                  min={0}
                  step="0.01"
                  value={rates[field.key]}
                  onChange={(e) =>
                    setRates((prev) => ({ ...prev, [field.key]: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            ))}
          </div>
          <Button className="mt-3" onClick={saveRates} disabled={savingRates}>
            {savingRates ? 'Saving...' : 'Save Rates'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Daily Charges</CardTitle>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIso()}
            className="w-auto"
          />
        </CardHeader>
        <CardContent>
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {rows.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              No charges recorded for this day. Charges are computed once, after market close.
            </p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">Segment</th>
                    <th className="py-2 text-right">Trades</th>
                    <th className="py-2 text-right">Turnover</th>
                    <th className="py-2 text-right">Brokerage</th>
                    <th className="py-2 text-right">STT</th>
                    <th className="py-2 text-right">Stamp Duty</th>
                    <th className="py-2 text-right">Exch. Charge</th>
                    <th className="py-2 text-right">SEBI Fee</th>
                    <th className="py-2 text-right">GST</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.segment} className="border-b last:border-0">
                      <td className="py-2">{SEGMENT_LABELS[row.segment] || row.segment}</td>
                      <td className="py-2 text-right">{row.tradeCount}</td>
                      <td className="py-2 text-right">{formatCurrency(row.turnover)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.brokerage)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.stt)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.stampDuty)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.exchangeTxnCharge)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.sebiFee)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.gst)}</td>
                      <td className="py-2 text-right font-medium">
                        {formatCurrency(row.totalCharges)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={9} className="pt-2 text-right font-medium">
                      Grand total
                    </td>
                    <td className="pt-2 text-right font-medium">{formatCurrency(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
