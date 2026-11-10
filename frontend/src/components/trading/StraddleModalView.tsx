// components/trading/StraddleModalView.tsx
// The dynamic ATM straddle over time, compacted for the /trading right-click
// menu. Shares the chart-lifecycle code and data client with the
// /straddle tools page (see that file's docstring for why the engine is
// driven this way); only the controls row and the container sizing differ —
// this fills whatever height the modal gives it instead of a fixed 500px.

import { type Chart, createChart, type SeriesApi } from 'openalgo-charts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { oiProfileApi } from '@/api/oi-profile'
import {
  type StraddleChartData,
  type StraddleDataPoint,
  straddleChartApi,
} from '@/api/straddle-chart'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { buildChartTheme, isLightTheme, resolveCssColor } from '@/lib/trading/chartTheme'
import { cn } from '@/lib/utils'
import { type AppMode, type ThemeMode, useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'

/** Every value on this chart is a price in rupees or index points: two decimals. */
const PRICE_FORMAT = { type: 'price', precision: 2, minMove: 0.01 } as const

/** The share of the pane kept clear above and below each axis's data. */
const SCALE_MARGIN = 0.05

function straddleLook(mode: ThemeMode, appMode: AppMode) {
  const base = buildChartTheme(mode, appMode)
  const light = isLightTheme(mode, appMode)
  return {
    theme: base,
    spot: resolveCssColor('var(--foreground)'),
    straddle: appMode === 'analyzer' ? base.lineColor : light ? '#16a34a' : '#4ade80',
    synthetic: light ? '#2563eb' : '#60a5fa',
  }
}

type StraddleLook = ReturnType<typeof straddleLook>

function chartThemeFor(
  look: StraddleLook,
  shown: { showStraddle: boolean; showSpot: boolean; showSynthetic: boolean }
) {
  const tag = shown.showStraddle ? look.straddle : shown.showSpot ? look.spot : look.synthetic
  return { ...look.theme, lastPriceUp: tag, lastPriceDown: tag }
}

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  return expiry.replace(/-/g, '').toUpperCase()
}

function formatIST(unixSeconds: number): { date: string; time: string } {
  const d = new Date(unixSeconds * 1000)
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
  const dd = ist.getUTCDate().toString().padStart(2, '0')
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const mo = months[ist.getUTCMonth()]
  const hh = ist.getUTCHours().toString().padStart(2, '0')
  const mm = ist.getUTCMinutes().toString().padStart(2, '0')
  return { date: `${dd} ${mo}`, time: `${hh}:${mm}` }
}

export interface StraddleModalViewProps {
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the chart with, e.g. the chart's own symbol. */
  underlying?: string
}

export function StraddleModalView({
  exchange: initialExchange,
  underlying: initialUnderlying,
}: StraddleModalViewProps) {
  const { mode, appMode } = useThemeStore()
  const { toolsFnoExchanges: fnoExchanges, defaultToolsFnoExchange: defaultFnoExchange } =
    useSupportedExchanges()

  const [isLoading, setIsLoading] = useState(false)
  const [selectedExchange, setSelectedExchange] = useState(initialExchange || defaultFnoExchange)
  const [selectedUnderlying, setSelectedUnderlying] = useState(initialUnderlying || '')
  const [underlyings, setUnderlyings] = useState<string[]>([])
  const [expiries, setExpiries] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [intervals, setIntervals] = useState<string[]>([])
  const [selectedInterval, setSelectedInterval] = useState('1m')
  const [selectedDays, setSelectedDays] = useState('1')
  const [chartData, setChartData] = useState<StraddleChartData | null>(null)

  // The straddle series is rebuilt bar by bar server-side — this tells the
  // trader it is still working rather than leaving a bare spinner that reads
  // as frozen past the point anyone trusts it.
  const [slowLoad, setSlowLoad] = useState(false)
  useEffect(() => {
    if (!isLoading) {
      setSlowLoad(false)
      return
    }
    const timer = setTimeout(() => setSlowLoad(true), 3000)
    return () => clearTimeout(timer)
  }, [isLoading])

  const [showStraddle, setShowStraddle] = useState(true)
  const [showSpot, setShowSpot] = useState(false)
  const [showSynthetic, setShowSynthetic] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const spotSeriesRef = useRef<SeriesApi | null>(null)
  const straddleSeriesRef = useRef<SeriesApi | null>(null)
  const syntheticSeriesRef = useRef<SeriesApi | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const chartDataRef = useRef<StraddleChartData | null>(null)
  const seriesDataMapRef = useRef<Map<number, StraddleDataPoint>>(new Map())

  useEffect(() => {
    setSelectedExchange((prev) =>
      prev && fnoExchanges.some((ex) => ex.value === prev) ? prev : defaultFnoExchange
    )
  }, [defaultFnoExchange, fnoExchanges])

  const look = useMemo(() => straddleLook(mode, appMode), [mode, appMode])
  const lookRef = useRef<StraddleLook>(look)
  lookRef.current = look

  const visibleRef = useRef({ showStraddle, showSpot, showSynthetic })
  visibleRef.current = { showStraddle, showSpot, showSynthetic }

  const applyDataToChart = useCallback((data: StraddleChartData) => {
    if (!data.series || data.series.length === 0) return
    const sorted = [...data.series].sort((a, b) => a.time - b.time)
    const map = new Map<number, StraddleDataPoint>()
    for (const p of sorted) map.set(p.time, p)
    seriesDataMapRef.current = map

    spotSeriesRef.current?.setData(sorted.map((p) => ({ time: p.time, value: p.spot })))
    straddleSeriesRef.current?.setData(sorted.map((p) => ({ time: p.time, value: p.straddle })))
    syntheticSeriesRef.current?.setData(
      sorted.map((p) => ({ time: p.time, value: p.synthetic_future }))
    )
    chartRef.current?.fitContent()
  }, [])

  // Built once. Theme changes and toggles restyle it in place below.
  useEffect(() => {
    const host = chartContainerRef.current
    if (!host) return

    const initial = lookRef.current
    const shown = visibleRef.current
    const chart = createChart(host, {
      theme: chartThemeFor(initial, shown),
      shortcuts: false,
      ariaLabel: 'Straddle chart',
    })

    const straddleSeries = chart.addSeries('line', {
      priceScaleId: 'right',
      priceFormat: PRICE_FORMAT,
      style: {
        color: initial.straddle,
        lineWidth: 2,
        title: 'Straddle',
        lastValueVisible: true,
        priceLineVisible: true,
        visible: shown.showStraddle,
      },
    })
    const spotSeries = chart.addSeries('line', {
      priceScaleId: 'left',
      priceFormat: PRICE_FORMAT,
      style: {
        color: initial.spot,
        lineWidth: 2,
        title: 'Spot',
        lastValueVisible: true,
        priceLineVisible: true,
        visible: shown.showSpot,
      },
    })
    const syntheticSeries = chart.addSeries('line', {
      priceScaleId: 'left',
      priceFormat: PRICE_FORMAT,
      style: {
        color: initial.synthetic,
        lineWidth: 1,
        lineStyle: 'dashed',
        title: 'Synthetic Fut',
        lastValueVisible: true,
        priceLineVisible: false,
        visible: shown.showSynthetic,
      },
    })

    straddleSeries.priceScale().setOptions({ marginTop: SCALE_MARGIN, marginBottom: SCALE_MARGIN })
    spotSeries.priceScale().setOptions({ marginTop: SCALE_MARGIN, marginBottom: SCALE_MARGIN })

    chartRef.current = chart
    spotSeriesRef.current = spotSeries
    straddleSeriesRef.current = straddleSeries
    syntheticSeriesRef.current = syntheticSeries

    const offCrosshair = chart.subscribeCrosshairMove((e) => {
      const tt = tooltipRef.current
      if (!tt) return
      const point = e.time == null ? undefined : seriesDataMapRef.current.get(e.time)
      if (!point || !e.point) {
        tt.style.display = ''
        return
      }
      const c = lookRef.current
      const { date, time: timeStr } = formatIST(point.time)
      tt.innerHTML = `
        <div class="flex justify-between gap-4 font-semibold" style="color:${c.straddle}">
          <span>Straddle</span><span>${point.straddle.toFixed(2)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted-foreground">${point.atm_strike} CE</span><span>${point.ce_price.toFixed(2)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted-foreground">${point.atm_strike} PE</span><span>${point.pe_price.toFixed(2)}</span>
        </div>
        <div class="flex justify-between gap-4" style="color:${c.synthetic}">
          <span>Synthetic</span><span>${point.synthetic_future.toFixed(2)}</span>
        </div>
        <div class="flex justify-between gap-4">
          <span class="text-muted-foreground">Spot</span><span>${point.spot.toFixed(2)}</span>
        </div>
        <div class="mt-1 flex justify-between gap-4 border-t border-border pt-1 text-muted-foreground">
          <span>${date}</span><span>${timeStr}</span>
        </div>
      `
      tt.style.display = 'block'
      const tooltipW = tt.offsetWidth
      const tooltipH = tt.offsetHeight
      const { x, y } = e.point
      const margin = 16
      let left = x + margin
      if (left + tooltipW > host.offsetWidth) left = x - tooltipW - margin
      let top = y - tooltipH / 2
      if (top + tooltipH > host.offsetHeight) top = host.offsetHeight - tooltipH
      if (top < 0) top = 0
      tt.style.left = `${left}px`
      tt.style.top = `${top}px`
    })

    if (chartDataRef.current) applyDataToChart(chartDataRef.current)

    return () => {
      offCrosshair()
      chart.destroy()
      host.innerHTML = ''
      if (tooltipRef.current) tooltipRef.current.style.display = ''
      chartRef.current = null
      spotSeriesRef.current = null
      straddleSeriesRef.current = null
      syntheticSeriesRef.current = null
    }
  }, [applyDataToChart])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setTheme(chartThemeFor(look, { showStraddle, showSpot, showSynthetic }))
    straddleSeriesRef.current?.applyOptions({ color: look.straddle, visible: showStraddle })
    spotSeriesRef.current?.applyOptions({ color: look.spot, visible: showSpot })
    syntheticSeriesRef.current?.applyOptions({ color: look.synthetic, visible: showSynthetic })
  }, [look, showStraddle, showSpot, showSynthetic])

  // biome-ignore lint/correctness/useExhaustiveDependencies: one-time mount fetch of available intervals; selectedInterval is only read to seed the default and must not re-trigger this fetch when the user changes interval
  useEffect(() => {
    const run = async () => {
      try {
        const res = await straddleChartApi.getIntervals()
        if (res.status === 'success' && res.data) {
          const all = [
            ...(res.data.seconds || []),
            ...(res.data.minutes || []),
            ...(res.data.hours || []),
          ]
          setIntervals(all.length > 0 ? all : ['1m', '3m', '5m', '10m', '15m', '30m', '1h'])
          if (all.length > 0 && !all.includes(selectedInterval)) {
            setSelectedInterval(all.includes('1m') ? '1m' : all[0])
          }
        }
      } catch {
        setIntervals(['1m', '3m', '5m', '10m', '15m', '30m', '1h'])
      }
    }
    run()
  }, [])

  const seededRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await oiProfileApi.getUnderlyings(selectedExchange)
        if (cancelled || response.status !== 'success') return
        setUnderlyings(response.underlyings)
        const seedWith =
          !seededRef.current &&
          initialUnderlying &&
          response.underlyings.includes(initialUnderlying)
            ? initialUnderlying
            : response.underlyings[0] || ''
        seededRef.current = true
        setSelectedUnderlying((prev) =>
          prev && response.underlyings.includes(prev) ? prev : seedWith
        )
      } catch {
        // Keep whatever is already selected.
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedExchange, initialUnderlying])

  useEffect(() => {
    if (!selectedUnderlying) return
    let cancelled = false
    const run = async () => {
      try {
        const response = await oiProfileApi.getExpiries(selectedExchange, selectedUnderlying)
        if (cancelled) return
        if (response.status === 'success' && response.expiries.length > 0) {
          setExpiries(response.expiries)
          setSelectedExpiry((prev) =>
            prev && response.expiries.includes(prev) ? prev : response.expiries[0]
          )
        } else {
          setExpiries([])
          setSelectedExpiry('')
        }
      } catch {
        setExpiries([])
        setSelectedExpiry('')
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedExchange, selectedUnderlying])

  const loadData = useCallback(async () => {
    if (!selectedExpiry) return
    setIsLoading(true)
    try {
      const res = await straddleChartApi.getStraddleData({
        underlying: selectedUnderlying,
        exchange: selectedExchange,
        expiry_date: convertExpiryForAPI(selectedExpiry),
        interval: selectedInterval,
        days: parseInt(selectedDays, 10),
      })
      if (res.status === 'success' && res.data) {
        chartDataRef.current = res.data
        setChartData(res.data)
        applyDataToChart(res.data)
      } else {
        showToast.error(res.message || 'Failed to load straddle data')
      }
    } catch {
      showToast.error('Failed to fetch straddle data')
    } finally {
      setIsLoading(false)
    }
  }, [
    selectedExpiry,
    selectedInterval,
    selectedDays,
    selectedUnderlying,
    selectedExchange,
    applyDataToChart,
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  const latestPoint: StraddleDataPoint | null = useMemo(() => {
    if (!chartData?.series?.length) return null
    return chartData.series[chartData.series.length - 1]
  }, [chartData])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2 pr-10">
        <Select value={selectedUnderlying} onValueChange={setSelectedUnderlying}>
          <SelectTrigger className="h-7 w-24 text-xs" size="sm">
            <SelectValue placeholder="Underlying" />
          </SelectTrigger>
          <SelectContent>
            {underlyings.map((u) => (
              <SelectItem key={u} value={u} className="text-xs">
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedExpiry}
          onValueChange={setSelectedExpiry}
          disabled={expiries.length === 0}
        >
          <SelectTrigger className="h-7 w-[8.5rem] text-xs" size="sm">
            <SelectValue placeholder="Expiry" />
          </SelectTrigger>
          <SelectContent>
            {expiries.map((exp) => (
              <SelectItem key={exp} value={exp} className="text-xs">
                {exp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedInterval} onValueChange={setSelectedInterval}>
          <SelectTrigger className="h-7 w-20 text-xs" size="sm">
            <SelectValue placeholder="Interval" />
          </SelectTrigger>
          <SelectContent>
            {intervals.map((intv) => (
              <SelectItem key={intv} value={intv} className="text-xs">
                {intv}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedDays} onValueChange={setSelectedDays}>
          <SelectTrigger className="h-7 w-20 text-xs" size="sm">
            <SelectValue placeholder="Days" />
          </SelectTrigger>
          <SelectContent>
            {['1', '3', '5'].map((d) => (
              <SelectItem key={d} value={d} className="text-xs">
                {d} {d === '1' ? 'Day' : 'Days'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={loadData}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
        {latestPoint && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Straddle{' '}
              <span className="font-mono font-semibold" style={{ color: look.straddle }}>
                {latestPoint.straddle.toFixed(2)}
              </span>
            </span>
            <span>
              Spot{' '}
              <span className="font-mono font-semibold text-foreground">
                {latestPoint.spot.toFixed(2)}
              </span>
            </span>
            <span>
              Strike{' '}
              <span className="font-mono font-semibold text-foreground">
                {latestPoint.atm_strike}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <div
          ref={tooltipRef}
          data-testid="straddle-tooltip"
          className="pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-md border border-border bg-popover/95 px-3 py-2 font-mono text-xs leading-relaxed text-popover-foreground shadow-sm"
        />
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {slowLoad && (
              <p className="text-xs text-muted-foreground">
                Rebuilding the straddle series — a few seconds on first load...
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => setShowStraddle((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            showStraddle ? 'bg-muted font-medium' : 'opacity-50 hover:opacity-75'
          )}
        >
          <span
            className="inline-block h-0.5 w-5 rounded"
            style={{ backgroundColor: look.straddle }}
          />
          Straddle
        </button>
        <button
          type="button"
          onClick={() => setShowSpot((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            showSpot ? 'bg-muted font-medium' : 'opacity-50 hover:opacity-75'
          )}
        >
          <span className="inline-block h-0.5 w-5 rounded" style={{ backgroundColor: look.spot }} />
          Spot
        </button>
        <button
          type="button"
          onClick={() => setShowSynthetic((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors',
            showSynthetic ? 'bg-muted font-medium' : 'opacity-50 hover:opacity-75'
          )}
        >
          <span
            className="inline-block h-0.5 w-5 rounded border-t-2 border-dashed"
            style={{ borderColor: look.synthetic, backgroundColor: 'transparent' }}
          />
          Synthetic Fut
        </button>
      </div>
    </div>
  )
}
