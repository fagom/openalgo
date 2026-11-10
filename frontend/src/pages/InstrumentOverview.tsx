import { Check, ChevronsUpDown } from 'lucide-react'
import type * as PlotlyTypes from 'plotly.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { type InstrumentOverviewResponse, instrumentOverviewApi } from '@/api/instrument-overview'
import { ivSmileApi } from '@/api/iv-smile'
import { InstrumentHelpDialog } from '@/components/instrument/InstrumentHelpDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { CHART_FONT, getChartPalette } from '@/lib/chartTheme'
import Plot from '@/lib/Plot2D'
import { serverSentence } from '@/lib/serverSentence'
import { useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) {
    return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  }
  return expiry.replace(/-/g, '').toUpperCase()
}

/** Strikes shown in the compact chain table: a handful either side of ATM. */
const CHAIN_WINDOW = 8

/**
 * Auto-refresh interval. Longer than IV Smile's 30s: this page's one request
 * already does an option chain fetch, a windowed Greeks pass and a daily
 * history fetch in sequence, so refreshing it as often as a single-chain
 * tool would mean standing requests overlapping on a slow broker connection.
 */
const AUTO_REFRESH_INTERVAL = 60000

export default function InstrumentOverview() {
  const { mode, appMode } = useThemeStore()
  const { toolsFnoExchanges, defaultToolsFnoExchange, defaultUnderlyings } = useSupportedExchanges()

  const [selectedExchange, setSelectedExchange] = useState(defaultToolsFnoExchange)
  const [underlyings, setUnderlyings] = useState<string[]>(
    defaultUnderlyings[defaultToolsFnoExchange] || []
  )
  const [underlyingOpen, setUnderlyingOpen] = useState(false)
  const [selectedUnderlying, setSelectedUnderlying] = useState(
    defaultUnderlyings[defaultToolsFnoExchange]?.[0] || ''
  )
  const [expiries, setExpiries] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [data, setData] = useState<InstrumentOverviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const requestIdRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setSelectedExchange((prev) =>
      prev && toolsFnoExchanges.some((ex) => ex.value === prev) ? prev : defaultToolsFnoExchange
    )
  }, [defaultToolsFnoExchange, toolsFnoExchanges])

  useEffect(() => {
    const defaults = defaultUnderlyings[selectedExchange] || []
    setUnderlyings(defaults)
    setSelectedUnderlying(defaults[0] || '')
    setExpiries([])
    setSelectedExpiry('')
    setData(null)

    let cancelled = false
    ;(async () => {
      try {
        const response = await ivSmileApi.getUnderlyings(selectedExchange)
        if (cancelled) return
        if (response.status === 'success' && response.underlyings.length > 0) {
          setUnderlyings(response.underlyings)
          if (!response.underlyings.includes(defaults[0])) {
            setSelectedUnderlying(response.underlyings[0])
          }
        }
      } catch {
        // Keep defaults
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedExchange, defaultUnderlyings])

  useEffect(() => {
    if (!selectedUnderlying) return
    setExpiries([])
    setSelectedExpiry('')
    setData(null)

    let cancelled = false
    ;(async () => {
      try {
        const response = await ivSmileApi.getExpiries(selectedExchange, selectedUnderlying)
        if (cancelled) return
        if (response.status === 'success' && response.expiries.length > 0) {
          setExpiries(response.expiries)
          setSelectedExpiry(response.expiries[0])
        } else {
          setExpiries([])
          setSelectedExpiry('')
        }
      } catch {
        if (cancelled) return
        setExpiries([])
        setSelectedExpiry('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedUnderlying, selectedExchange])

  const fetchOverview = useCallback(async () => {
    if (!selectedExpiry) return
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    try {
      const response = await instrumentOverviewApi.getOverview({
        underlying: selectedUnderlying,
        exchange: selectedExchange,
        expiry_date: convertExpiryForAPI(selectedExpiry),
      })
      if (requestIdRef.current !== requestId) return
      if (response.status === 'success') {
        setData(response)
      } else {
        showToast.error(response.message || 'Failed to fetch instrument overview')
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      showToast.error(serverSentence(error, 'Failed to fetch instrument overview'))
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false)
    }
  }, [selectedUnderlying, selectedExpiry, selectedExchange])

  // biome-ignore lint/correctness/useExhaustiveDependencies: must fire only on selectedExpiry change; including fetchOverview would re-run with mixed exchange/underlying params during an exchange switch and fire a stale overview request
  useEffect(() => {
    if (selectedExpiry) fetchOverview()
  }, [selectedExpiry])

  useEffect(() => {
    if (autoRefresh && selectedExpiry) {
      intervalRef.current = setInterval(fetchOverview, AUTO_REFRESH_INTERVAL)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, fetchOverview, selectedExpiry])

  const themeColors = useMemo(() => {
    const p = getChartPalette(mode, appMode)
    return {
      bg: 'rgba(0,0,0,0)',
      paper: 'rgba(0,0,0,0)',
      text: p.text,
      grid: p.grid,
      increasing: p.up,
      decreasing: p.down,
      hoverBg: p.tooltipBg,
      hoverFont: p.tooltipText,
      hoverBorder: p.tooltipBorder,
    }
  }, [mode, appMode])

  const pricePlot = useMemo(() => {
    const bars = data?.daily_bars
    if (!bars || bars.length === 0) return { data: [], layout: {} }

    const x = bars.map((b) => new Date(b.timestamp * 1000).toISOString().slice(0, 10))
    const trace: PlotlyTypes.Data = {
      x,
      open: bars.map((b) => b.open),
      high: bars.map((b) => b.high),
      low: bars.map((b) => b.low),
      close: bars.map((b) => b.close),
      type: 'candlestick',
      increasing: { line: { color: themeColors.increasing } },
      decreasing: { line: { color: themeColors.decreasing } },
      showlegend: false,
    }

    const layout: Partial<PlotlyTypes.Layout> = {
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.bg,
      font: { family: CHART_FONT, color: themeColors.text },
      margin: { l: 50, r: 20, t: 10, b: 30 },
      xaxis: { gridcolor: themeColors.grid, rangeslider: { visible: false } },
      yaxis: { gridcolor: themeColors.grid },
      hoverlabel: {
        bgcolor: themeColors.hoverBg,
        font: { color: themeColors.hoverFont },
        bordercolor: themeColors.hoverBorder,
      },
    }

    return { data: [trace], layout }
  }, [data, themeColors])

  const chainWindow = useMemo(() => {
    if (!data?.chain || !data.atm_strike) return []
    const atmIndex = data.chain.findIndex((s) => s.strike === data.atm_strike)
    if (atmIndex === -1) return data.chain
    const start = Math.max(0, atmIndex - CHAIN_WINDOW)
    const end = Math.min(data.chain.length, atmIndex + CHAIN_WINDOW + 1)
    return data.chain.slice(start, end)
  }, [data])

  const fmt = (v: number | null | undefined, suffix = '') =>
    v === null || v === undefined ? '--' : `${v}${suffix}`

  return (
    <div className="py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-bold">Instrument</h1>
          <InstrumentHelpDialog />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedExchange} onValueChange={setSelectedExchange}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Exchange" />
            </SelectTrigger>
            <SelectContent>
              {toolsFnoExchanges.map((ex) => (
                <SelectItem key={ex.value} value={ex.value}>
                  {ex.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={underlyingOpen} onOpenChange={setUnderlyingOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={underlyingOpen}
                className="w-[160px] justify-between"
              >
                {selectedUnderlying || 'Underlying'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search underlying..." />
                <CommandList>
                  <CommandEmpty>No underlying found</CommandEmpty>
                  <CommandGroup>
                    {underlyings.map((u) => (
                      <CommandItem
                        key={u}
                        value={u}
                        onSelect={() => {
                          setSelectedUnderlying(u)
                          setUnderlyingOpen(false)
                        }}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${selectedUnderlying === u ? 'opacity-100' : 'opacity-0'}`}
                        />
                        {u}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select
            value={selectedExpiry}
            onValueChange={setSelectedExpiry}
            disabled={expiries.length === 0}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Expiry" />
            </SelectTrigger>
            <SelectContent>
              {expiries.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </Button>

          <Button variant="outline" size="sm" onClick={fetchOverview} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {data && data.status === 'success' && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">Spot</p>
                <p className="text-lg font-bold">{fmt(data.spot_price)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">ATM Strike</p>
                <p className="text-lg font-bold">{fmt(data.atm_strike)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">PCR (OI)</p>
                <p className="text-lg font-bold">{fmt(data.pcr)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">Max Pain</p>
                <p className="text-lg font-bold">{fmt(data.max_pain_strike)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">ATM IV</p>
                <p className="text-lg font-bold">{fmt(data.atm_iv, '%')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">Realized Vol</p>
                <p className="text-lg font-bold">{fmt(data.realized_vol_close, '%')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">VRP</p>
                <p
                  className={`text-lg font-bold ${data.vrp != null ? (data.vrp >= 0 ? 'text-profit' : 'text-loss') : ''}`}
                >
                  {data.vrp != null ? `${data.vrp > 0 ? '+' : ''}${data.vrp}` : '--'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 space-y-0.5">
                <p className="text-xs text-muted-foreground">IV Rank / %ile</p>
                <p className="text-lg font-bold">
                  {data.iv_rank != null ? `${data.iv_rank} / ${data.iv_percentile}` : '--'}
                </p>
                {data.iv_rank == null && (
                  <p className="text-[10px] text-muted-foreground">
                    Building ({data.iv_history_days ?? 0}d)
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Market Regime: four independently-computed signals cross-referenced
              into one trend/range read, with the reasoning spelled out rather
              than a single number asking to be trusted blind. */}
          {data.regime && (
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-muted-foreground">Market Regime</h2>
                  <Badge
                    variant={data.regime.label === 'Transitional' ? 'secondary' : 'default'}
                    className={
                      data.regime.label.startsWith('Trending')
                        ? 'bg-primary'
                        : data.regime.label === 'Range-bound'
                          ? 'bg-warning text-warning-foreground'
                          : ''
                    }
                  >
                    {data.regime.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {data.regime.votes_trend} trend vote{data.regime.votes_trend === 1 ? '' : 's'} ·{' '}
                    {data.regime.votes_range} range vote
                    {data.regime.votes_range === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Trend (ADX)</p>
                    <p className="text-sm font-semibold">
                      {data.adx != null ? data.adx : '--'}
                      {data.trend_bias && data.trend_bias !== 'flat' && (
                        <span className="text-xs text-muted-foreground"> · {data.trend_bias}</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Net GEX (near ATM)</p>
                    <p
                      className={`text-sm font-semibold ${data.net_gex != null ? (data.net_gex >= 0 ? 'text-profit' : 'text-loss') : ''}`}
                    >
                      {data.net_gex != null
                        ? `${data.net_gex > 0 ? '+' : ''}${data.net_gex.toLocaleString('en-IN')}`
                        : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max Pain pull</p>
                    <p className="text-sm font-semibold">
                      {data.max_pain_pct != null
                        ? `${data.max_pain_pct > 0 ? '+' : ''}${data.max_pain_pct}%`
                        : '--'}
                      {data.max_pain_state && (
                        <span className="text-xs text-muted-foreground">
                          {' '}
                          · {data.max_pain_state}
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">IV Rank / VRP</p>
                    <p className="text-sm font-semibold">
                      {data.iv_rank != null ? data.iv_rank : '--'} /{' '}
                      {data.vrp != null ? data.vrp : '--'}
                    </p>
                  </div>
                </div>

                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  {data.regime.rationale.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Price chart */}
          <Card>
            <CardContent className="p-2 sm:p-4">
              {pricePlot.data.length > 0 ? (
                <Plot
                  data={pricePlot.data}
                  layout={pricePlot.layout}
                  config={{ displayModeBar: false, responsive: true }}
                  useResizeHandler
                  style={{ width: '100%', height: '360px' }}
                />
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                  No price history available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Compact option chain, centred on ATM */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Option Chain (near ATM)
                </h2>
                <div className="flex gap-2 text-xs">
                  <Link to="/optionchain" className="text-primary hover:underline">
                    Full chain
                  </Link>
                  <Link to="/oiprofile" className="text-primary hover:underline">
                    OI buildup
                  </Link>
                  <Link to="/ivsmile" className="text-primary hover:underline">
                    IV smile
                  </Link>
                </div>
              </div>
              <table className="w-full text-sm mt-3">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-right px-3 py-2">CE OI</th>
                    <th className="text-right px-3 py-2">CE LTP</th>
                    <th className="text-center px-3 py-2">Strike</th>
                    <th className="text-left px-3 py-2">PE LTP</th>
                    <th className="text-left px-3 py-2">PE OI</th>
                  </tr>
                </thead>
                <tbody>
                  {chainWindow.map((row) => (
                    <tr
                      key={row.strike}
                      className={
                        row.strike === data.atm_strike ? 'bg-primary/10' : 'hover:bg-muted/50'
                      }
                    >
                      <td className="text-right px-3 py-1.5 tabular-nums">
                        {row.ce?.oi?.toLocaleString('en-IN') ?? '--'}
                      </td>
                      <td className="text-right px-3 py-1.5 tabular-nums">
                        {row.ce?.ltp?.toFixed(2) ?? '--'}
                      </td>
                      <td className="text-center px-3 py-1.5 font-medium">{row.strike}</td>
                      <td className="text-left px-3 py-1.5 tabular-nums">
                        {row.pe?.ltp?.toFixed(2) ?? '--'}
                      </td>
                      <td className="text-left px-3 py-1.5 tabular-nums">
                        {row.pe?.oi?.toLocaleString('en-IN') ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {!data && isLoading && (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
          Loading instrument overview...
        </div>
      )}

      {!data && !isLoading && (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground">
          Select an underlying and expiry to view the overview
        </div>
      )}

      {data?.underlying_exchange && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {data.underlying_symbol} · {data.underlying_exchange}
          </Badge>
        </div>
      )}
    </div>
  )
}
