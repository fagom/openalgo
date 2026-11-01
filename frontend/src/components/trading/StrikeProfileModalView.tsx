// components/trading/StrikeProfileModalView.tsx
// A compact GEX/DEX-by-strike chart, purpose-built for the /trading
// right-click menu. Shares the strike-profile data client with the
// /strikeprofile tools page, but not its multi-expiry table/chart toolbar —
// this is one expiry, one metric, sized for a modal glance.

import type * as PlotlyTypes from 'plotly.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type StrikeProfileResponse, strikeProfileApi } from '@/api/strike-profile'
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
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'

type Metric = 'gex' | 'dex'

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  return expiry.replace(/-/g, '').toUpperCase()
}

function fmtExposure(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 100) return `${sign}${(abs / 100).toFixed(1)}K Cr`
  return `${sign}${abs.toFixed(1)} Cr`
}

function metricColors(metric: Metric, isDark: boolean): { pos: string; neg: string } {
  if (metric === 'gex') return { pos: isDark ? '#3b82f6' : '#2563eb', neg: '#ea580c' }
  return { pos: '#0d9488', neg: '#e11d48' }
}

export interface StrikeProfileModalViewProps {
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the view with, e.g. the chart's own symbol. */
  underlying?: string
}

export function StrikeProfileModalView({
  exchange: initialExchange,
  underlying: initialUnderlying,
}: StrikeProfileModalViewProps) {
  const { mode, appMode } = useThemeStore()
  const { toolsFnoExchanges: fnoExchanges, defaultToolsFnoExchange: defaultFnoExchange } =
    useSupportedExchanges()

  const [selectedExchange, setSelectedExchange] = useState(initialExchange || defaultFnoExchange)
  const [selectedUnderlying, setSelectedUnderlying] = useState(initialUnderlying || '')
  const [underlyings, setUnderlyings] = useState<string[]>([])
  const [expiries, setExpiries] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [metric, setMetric] = useState<Metric>('gex')
  const [data, setData] = useState<StrikeProfileResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const requestIdRef = useRef(0)

  // GEX/DEX across a full chain genuinely takes a few seconds — this tells
  // the trader it is still working rather than leaving a bare spinner that
  // reads as frozen past the point anyone trusts it.
  const [slowLoad, setSlowLoad] = useState(false)
  useEffect(() => {
    if (!isLoading) {
      setSlowLoad(false)
      return
    }
    const timer = setTimeout(() => setSlowLoad(true), 3000)
    return () => clearTimeout(timer)
  }, [isLoading])

  useEffect(() => {
    setSelectedExchange((prev) =>
      prev && fnoExchanges.some((ex) => ex.value === prev) ? prev : defaultFnoExchange
    )
  }, [defaultFnoExchange, fnoExchanges])

  const seededRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await strikeProfileApi.getUnderlyings(selectedExchange)
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
        const response = await strikeProfileApi.getExpiries(selectedExchange, selectedUnderlying)
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

  useEffect(() => {
    if (!selectedExpiry || !selectedUnderlying) return
    let cancelled = false
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    const run = async () => {
      try {
        const response = await strikeProfileApi.getProfileData({
          underlying: selectedUnderlying,
          exchange: selectedExchange,
          expiry_dates: [convertExpiryForAPI(selectedExpiry)],
          range_pct: 10,
        })
        if (cancelled || requestIdRef.current !== requestId) return
        if (response.status === 'success') {
          setData(response)
        } else {
          showToast.error(response.message || 'Failed to fetch strike profile')
        }
      } catch {
        if (!cancelled) showToast.error('Failed to fetch strike profile')
      } finally {
        if (!cancelled && requestIdRef.current === requestId) setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [selectedExchange, selectedUnderlying, selectedExpiry])

  const expiryData = data?.expiries?.[0]
  const strikes = data?.strikes ?? []

  const themeColors = useMemo(() => {
    const p = getChartPalette(mode, appMode)
    return { bg: 'rgba(0,0,0,0)', text: p.text, grid: p.grid }
  }, [mode, appMode])
  const colors = metricColors(metric, mode === 'dark')

  const plotData = useMemo(() => {
    if (!expiryData || strikes.length === 0) return { data: [], layout: {} }

    const values = strikes.map((_, i) => {
      const cell = expiryData.cells[i]
      if (!cell) return 0
      return metric === 'gex' ? cell.gex : cell.dex
    })
    const barColors = values.map((v) => (v >= 0 ? colors.pos : colors.neg))
    const tickLabels = strikes.map((s) => s.toString())

    const spotIndex =
      data?.spot_price !== undefined
        ? strikes.reduce(
            (closest, s, i) =>
              Math.abs(s - (data.spot_price ?? 0)) <
              Math.abs(strikes[closest] - (data.spot_price ?? 0))
                ? i
                : closest,
            0
          )
        : -1

    const plotlyData: PlotlyTypes.Data[] = [
      {
        x: strikes,
        y: values,
        type: 'bar' as const,
        marker: { color: barColors },
        text: tickLabels,
        hovertemplate: `Strike %{x}<br>${metric.toUpperCase()}: %{y:.1f} Cr<extra></extra>`,
      },
    ]

    const shapes: Partial<PlotlyTypes.Shape>[] =
      spotIndex >= 0
        ? [
            {
              type: 'line' as const,
              x0: strikes[spotIndex],
              x1: strikes[spotIndex],
              y0: 0,
              y1: 1,
              yref: 'paper' as const,
              line: { color: themeColors.text, width: 1.5, dash: 'dash' as const },
            },
          ]
        : []

    const layout: Partial<PlotlyTypes.Layout> = {
      paper_bgcolor: themeColors.bg,
      plot_bgcolor: themeColors.bg,
      font: { color: themeColors.text, family: CHART_FONT, size: 11 },
      bargap: 0.15,
      hovermode: 'x' as const,
      showlegend: false,
      margin: { l: 55, r: 15, t: 10, b: 50 },
      xaxis: {
        tickfont: { color: themeColors.text, size: 9 },
        gridcolor: themeColors.grid,
        tickangle: -45,
      },
      yaxis: {
        title: {
          text: `${metric.toUpperCase()} (Cr)`,
          font: { color: themeColors.text, size: 11 },
        },
        tickfont: { color: themeColors.text, size: 9 },
        gridcolor: themeColors.grid,
        zerolinecolor: themeColors.grid,
      },
      shapes,
    }

    return { data: plotlyData, layout }
  }, [expiryData, strikes, metric, colors, themeColors, data?.spot_price])

  const plotConfig: Partial<PlotlyTypes.Config> = useMemo(
    () => ({
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: [
        'pan2d',
        'select2d',
        'lasso2d',
        'autoScale2d',
        'toggleSpikelines',
      ] as PlotlyTypes.ModeBarDefaultButtons[],
      responsive: true,
    }),
    []
  )

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
        <div className="flex h-7 items-center rounded-md border text-xs">
          {(['gex', 'dex'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                'h-full px-3 uppercase first:rounded-l-md last:rounded-r-md',
                metric === m
                  ? 'bg-accent font-semibold text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {data && data.status === 'success' && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Spot{' '}
              <span className="font-mono font-semibold text-foreground">
                {data.spot_price?.toFixed(1)}
              </span>
            </span>
            {data.flip !== null && data.flip !== undefined && (
              <span>
                Flip{' '}
                <span className="font-mono font-semibold text-foreground">
                  {data.flip.toFixed(0)}
                </span>
              </span>
            )}
            {data.call_wall !== null && data.call_wall !== undefined && (
              <span>
                Call Wall{' '}
                <span className="font-mono font-semibold text-success">{data.call_wall}</span>
              </span>
            )}
            {data.put_wall !== null && data.put_wall !== undefined && (
              <span>
                Put Wall{' '}
                <span className="font-mono font-semibold text-destructive">{data.put_wall}</span>
              </span>
            )}
            {(expiryData?.net_gex !== undefined || expiryData?.net_dex !== undefined) && (
              <span>
                Net {metric.toUpperCase()}{' '}
                <span className="font-mono font-semibold text-foreground">
                  {fmtExposure(metric === 'gex' ? expiryData?.net_gex : expiryData?.net_dex)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div
        className={cn('min-h-0 flex-1', isLoading && !data && 'flex items-center justify-center')}
      >
        {isLoading && !data ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            {slowLoad && (
              <p className="text-xs text-muted-foreground">
                Computing GEX/DEX across the chain — a few seconds on first load...
              </p>
            )}
          </div>
        ) : expiryData && strikes.length > 0 ? (
          <Plot
            data={plotData.data}
            layout={plotData.layout}
            config={plotConfig}
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {selectedExpiry
              ? 'No strike profile data available'
              : 'Select an underlying and expiry'}
          </div>
        )}
      </div>
    </div>
  )
}
