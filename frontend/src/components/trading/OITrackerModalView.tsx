// components/trading/OITrackerModalView.tsx
// A compact OI Tracker chart, purpose-built for the /trading right-click
// menu. Shares the data client and Plotly bar chart with the /oitracker
// tools page, but drops that page's full-screen toolbar chrome for a header
// sized to a modal glance.

import type * as PlotlyTypes from 'plotly.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type OIDataResponse, oiTrackerApi } from '@/api/oi-tracker'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { CHART_FONT, getChartPalette, withAlpha } from '@/lib/chartTheme'
import Plot from '@/lib/Plot2D'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  return expiry.replace(/-/g, '').toUpperCase()
}

function formatNumber(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

export interface OITrackerModalViewProps {
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the tracker with, e.g. the chart's own symbol. */
  underlying?: string
}

export function OITrackerModalView({
  exchange: initialExchange,
  underlying: initialUnderlying,
}: OITrackerModalViewProps) {
  const { mode, appMode } = useThemeStore()
  const { toolsFnoExchanges: fnoExchanges, defaultToolsFnoExchange: defaultFnoExchange } =
    useSupportedExchanges()

  const [selectedExchange, setSelectedExchange] = useState(initialExchange || defaultFnoExchange)
  const [selectedUnderlying, setSelectedUnderlying] = useState(initialUnderlying || '')
  const [underlyings, setUnderlyings] = useState<string[]>([])
  const [expiries, setExpiries] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [oiData, setOiData] = useState<OIDataResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const requestIdRef = useRef(0)

  // A fresh underlying/exchange combo pays for a cold symbol-master lookup —
  // this tells the trader it is still working rather than a frozen spinner.
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

  // Underlyings for the current exchange, seeded with the caller's symbol once.
  const seededRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const response = await oiTrackerApi.getUnderlyings(selectedExchange)
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
        const response = await oiTrackerApi.getExpiries(selectedExchange, selectedUnderlying)
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

  const fetchOIData = useCallback(async () => {
    if (!selectedExpiry) return
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    try {
      const response = await oiTrackerApi.getOIData({
        underlying: selectedUnderlying,
        exchange: selectedExchange,
        expiry_date: convertExpiryForAPI(selectedExpiry),
      })
      if (requestIdRef.current !== requestId) return
      if (response.status === 'success') {
        setOiData(response)
      } else {
        showToast.error(response.message || 'Failed to fetch OI data')
      }
    } catch {
      if (requestIdRef.current !== requestId) return
      showToast.error('Failed to fetch OI data')
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false)
    }
  }, [selectedUnderlying, selectedExpiry, selectedExchange])

  // biome-ignore lint/correctness/useExhaustiveDependencies: must fire only when selectedExpiry changes; adding fetchOIData would refire on underlying/exchange changes mid-switch and issue a stale request with mixed params
  useEffect(() => {
    if (selectedExpiry) fetchOIData()
  }, [selectedExpiry])

  const themeColors = useMemo(() => {
    const p = getChartPalette(mode, appMode)
    return {
      bg: 'rgba(0,0,0,0)',
      paper: 'rgba(0,0,0,0)',
      text: p.text,
      grid: p.grid,
      ceBar: p.up,
      peBar: p.down,
      atmLine: withAlpha(p.text, 0.55),
      hoverBg: p.tooltipBg,
      hoverFont: p.tooltipText,
      hoverBorder: p.tooltipBorder,
    }
  }, [mode, appMode])

  const plotData = useMemo(() => {
    if (!oiData?.chain) return { data: [], layout: {} }
    const lotSize = oiData.lot_size || 1
    const atmStrike = oiData.atm_strike
    const chain = oiData.chain

    const xIndices = chain.map((_, i) => i)
    const tickLabels = chain.map((item) => item.strike.toString())
    const ceOILots = chain.map((item) => Math.round(item.ce_oi / lotSize))
    const peOILots = chain.map((item) => Math.round(item.pe_oi / lotSize))

    const tickStep = Math.max(1, Math.floor(chain.length / 12))
    const tickVals = xIndices.filter((_, i) => i % tickStep === 0)
    const tickText = tickLabels.filter((_, i) => i % tickStep === 0)

    const data: PlotlyTypes.Data[] = [
      {
        x: xIndices,
        y: ceOILots,
        type: 'bar' as const,
        name: 'Call OI (lots)',
        marker: { color: themeColors.ceBar },
        hovertemplate: 'Strike %{text}<br>CE OI: %{y:,}<extra></extra>',
        text: tickLabels,
        textposition: 'none' as const,
      },
      {
        x: xIndices,
        y: peOILots,
        type: 'bar' as const,
        name: 'Put OI (lots)',
        marker: { color: themeColors.peBar },
        hovertemplate: 'Strike %{text}<br>PE OI: %{y:,}<extra></extra>',
        text: tickLabels,
        textposition: 'none' as const,
      },
    ]

    const atmIndex = atmStrike ? chain.findIndex((item) => item.strike === atmStrike) : -1
    const shapes: Partial<PlotlyTypes.Shape>[] =
      atmIndex >= 0
        ? [
            {
              type: 'line' as const,
              x0: atmIndex,
              x1: atmIndex,
              y0: 0,
              y1: 1,
              yref: 'paper' as const,
              line: { color: themeColors.atmLine, width: 1.5, dash: 'dash' as const },
            },
          ]
        : []

    const layout: Partial<PlotlyTypes.Layout> = {
      paper_bgcolor: themeColors.paper,
      plot_bgcolor: themeColors.bg,
      font: { color: themeColors.text, family: CHART_FONT, size: 11 },
      barmode: 'group' as const,
      bargap: 0.15,
      hovermode: 'x unified' as const,
      hoverlabel: {
        bgcolor: themeColors.hoverBg,
        font: { color: themeColors.hoverFont, size: 11 },
        bordercolor: themeColors.hoverBorder,
      },
      showlegend: true,
      legend: {
        orientation: 'h' as const,
        x: 0.5,
        xanchor: 'center' as const,
        y: -0.18,
        font: { color: themeColors.text, size: 10 },
      },
      margin: { l: 55, r: 15, t: 10, b: 60 },
      xaxis: {
        tickmode: 'array' as const,
        tickvals: tickVals,
        ticktext: tickText,
        tickfont: { color: themeColors.text, size: 9 },
        gridcolor: themeColors.grid,
        tickangle: -45,
      },
      yaxis: {
        tickfont: { color: themeColors.text, size: 9 },
        gridcolor: themeColors.grid,
      },
      shapes,
    }

    return { data, layout }
  }, [oiData, themeColors])

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
      {/* Compact header, right-padded past the dialog's own close button. */}
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
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={fetchOIData}
          disabled={!selectedExpiry || isLoading}
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </Button>
        {oiData && oiData.status === 'success' && (
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Spot{' '}
              <span className="font-mono font-semibold text-foreground">
                {oiData.spot_price?.toFixed(1)}
              </span>
            </span>
            <span>
              ATM{' '}
              <span className="font-mono font-semibold text-foreground">{oiData.atm_strike}</span>
            </span>
            <span>
              PCR{' '}
              <span className="font-mono font-semibold text-foreground">
                {oiData.pcr_oi?.toFixed(2)}
              </span>
            </span>
            <span>
              CE OI{' '}
              <span className="font-mono font-semibold text-success">
                {formatNumber(oiData.total_ce_oi || 0)}
              </span>
            </span>
            <span>
              PE OI{' '}
              <span className="font-mono font-semibold text-destructive">
                {formatNumber(oiData.total_pe_oi || 0)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Chart fills whatever the modal gives it. */}
      <div
        className={cn('min-h-0 flex-1', isLoading && !oiData && 'flex items-center justify-center')}
      >
        {isLoading && !oiData ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            {slowLoad && (
              <p className="text-xs text-muted-foreground">
                Loading the chain — a few seconds on first load...
              </p>
            )}
          </div>
        ) : oiData?.chain && oiData.chain.length > 0 ? (
          <Plot
            data={plotData.data}
            layout={plotData.layout}
            config={plotConfig}
            useResizeHandler
            style={{ width: '100%', height: '100%' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {selectedExpiry ? 'No OI data available' : 'Select an underlying and expiry'}
          </div>
        )}
      </div>
    </div>
  )
}
