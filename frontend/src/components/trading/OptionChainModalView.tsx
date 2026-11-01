// components/trading/OptionChainModalView.tsx
// A dense, modal-native option chain, purpose-built for the /trading
// right-click menu. Shares the live-data hook and API clients with the
// /optionchain tools page, but not its layout: that page is a full-screen
// tool with its own toolbar chrome, column configuration and bar charts,
// which overwhelms a modal meant for a quick glance while charting.

import { ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { oiProfileApi } from '@/api/oi-profile'
import { PlaceOrderDialog } from '@/components/trading/PlaceOrderDialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOptionChainLive } from '@/hooks/useOptionChainLive'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { changeFromClose, isInTheMoney, maxOiStrikes, spotMarkerIndex } from '@/lib/optionChainView'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import type { OptionData, OptionStrike } from '@/types/option-chain'

const STRIKE_COUNTS = [10, 15, 20, 25]

function fmtPrice(n: number | undefined | null): string {
  if (n === undefined || n === null) return '-'
  return n.toFixed(2)
}

function fmtOi(n: number | undefined | null): string {
  if (!n) return '-'
  const lakhs = n / 100000
  return lakhs >= 1 ? `${lakhs.toFixed(1)}L` : `${(n / 1000).toFixed(0)}K`
}

/** A missing Greek (no quote, expired chain, unconvergeable price) reads as a dash, never 0.00. */
function fmtGreek(n: number | undefined | null, decimals: number): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-'
  return n.toFixed(decimals)
}

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  return expiry.replace(/-/g, '').toUpperCase()
}

interface LegCellProps {
  leg: OptionData | null | undefined
  side: 'ce' | 'pe'
  itm: boolean
  isMax: boolean
  onOrder: (action: 'BUY' | 'SELL', leg: OptionData) => void
}

/** One side of one strike row: OI, IV, delta, LTP and change, all at once — plus a buy/sell pair that only shows on hover. */
function LegCell({ leg, side, itm, isMax, onOrder }: LegCellProps) {
  const chg = changeFromClose(leg?.ltp, leg?.prev_close)
  const align = side === 'ce' ? 'text-right' : 'text-left'

  const oiField = (
    <span
      key="oi"
      className={cn(
        'w-11 font-mono text-xs tabular-nums text-muted-foreground',
        align,
        isMax && 'font-semibold text-foreground'
      )}
    >
      {fmtOi(leg?.oi)}
    </span>
  )
  const ivField = (
    <span
      key="iv"
      className={cn('w-11 font-mono text-xs tabular-nums text-muted-foreground', align)}
    >
      {fmtGreek(leg?.implied_volatility, 1)}
    </span>
  )
  const deltaField = (
    <span
      key="delta"
      className={cn('w-12 font-mono text-xs tabular-nums text-muted-foreground', align)}
    >
      {fmtGreek(leg?.delta, 3)}
    </span>
  )
  const ltpField = (
    <span key="ltp" className={cn('w-16 font-mono text-sm font-semibold tabular-nums', align)}>
      {fmtPrice(leg?.ltp)}
    </span>
  )
  const chgField = (
    <span
      key="chg"
      className={cn(
        'w-14 font-mono text-xs tabular-nums',
        align,
        chg && chg.change > 0
          ? 'text-profit'
          : chg && chg.change < 0
            ? 'text-loss'
            : 'text-muted-foreground'
      )}
    >
      {chg ? `${chg.change > 0 ? '+' : ''}${chg.percent.toFixed(1)}%` : '-'}
    </span>
  )
  // Mirrored around the strike column: change and LTP sit nearest it on both
  // sides, OI sits farthest, so a trader's eye finds the same field at the
  // same distance from center whichever side they're reading.
  const fields =
    side === 'ce'
      ? [oiField, ivField, deltaField, ltpField, chgField]
      : [chgField, ltpField, deltaField, ivField, oiField]

  return (
    <div
      className={cn(
        'group relative flex flex-1 items-center gap-2 px-2 py-1.5',
        itm && 'bg-warning/8',
        side === 'ce' ? 'justify-end' : 'justify-start'
      )}
    >
      {leg && (
        <div
          className={cn(
            'absolute inset-y-0 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
            side === 'ce' ? 'left-1' : 'right-1'
          )}
        >
          <button
            type="button"
            aria-label={`Buy ${leg.symbol}`}
            onClick={(e) => {
              e.stopPropagation()
              onOrder('BUY', leg)
            }}
            className="h-6 min-w-6 rounded bg-buy px-1.5 text-xs font-bold text-buy-foreground hover:bg-buy/90"
          >
            B
          </button>
          <button
            type="button"
            aria-label={`Sell ${leg.symbol}`}
            onClick={(e) => {
              e.stopPropagation()
              onOrder('SELL', leg)
            }}
            className="h-6 min-w-6 rounded bg-sell px-1.5 text-xs font-bold text-sell-foreground hover:bg-sell/90"
          >
            S
          </button>
        </div>
      )}
      {fields}
    </div>
  )
}

export interface OptionChainModalViewProps {
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the chain with, e.g. the chart's own symbol. */
  underlying?: string
}

export function OptionChainModalView({
  exchange: initialExchange,
  underlying: initialUnderlying,
}: OptionChainModalViewProps) {
  const { apiKey } = useAuthStore()
  const { toolsFnoExchanges: fnoExchanges, defaultToolsFnoExchange: defaultFnoExchange } =
    useSupportedExchanges()

  const [selectedExchange, setSelectedExchange] = useState(initialExchange || defaultFnoExchange)
  const [selectedUnderlying, setSelectedUnderlying] = useState(initialUnderlying || '')
  const [underlyings, setUnderlyings] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [expiries, setExpiries] = useState<string[]>([])
  const [strikeCount, setStrikeCount] = useState(15)
  const [orderDialog, setOrderDialog] = useState<{
    open: boolean
    symbol: string
    exchange: string
    action: 'BUY' | 'SELL'
    lotSize: number
    tickSize: number
  } | null>(null)

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

  const { data, isStreaming, refetch, isLoading } = useOptionChainLive(
    apiKey,
    selectedUnderlying,
    selectedExchange,
    selectedExchange,
    convertExpiryForAPI(selectedExpiry),
    strikeCount,
    { enabled: !!selectedExpiry, oiRefreshInterval: 30000, pauseWhenHidden: true }
  )

  const spot = data?.underlying_ltp ?? 0
  const spotChange = changeFromClose(data?.underlying_ltp, data?.underlying_prev_close)
  const oiLevels = useMemo(
    () => (data?.chain ? maxOiStrikes(data.chain) : { ce: null, pe: null }),
    [data?.chain]
  )
  // The busiest leg in the visible chain sets the scale every OI bar is drawn
  // against, so bars read relative to each other rather than to a fixed cap.
  const maxOi = useMemo(() => {
    if (!data?.chain) return 1
    let max = 1
    for (const row of data.chain) {
      if (row.ce?.oi && row.ce.oi > max) max = row.ce.oi
      if (row.pe?.oi && row.pe.oi > max) max = row.pe.oi
    }
    return max
  }, [data?.chain])
  const markerIndex = useMemo(
    () => (data?.chain ? spotMarkerIndex(data.chain, spot) : -1),
    [data?.chain, spot]
  )

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const centeredForRef = useRef('')
  useEffect(() => {
    const key = `${selectedExchange}:${selectedUnderlying}:${selectedExpiry}`
    const el = scrollRef.current
    if (!data?.chain?.length || !el || centeredForRef.current === key) return
    const target =
      el.querySelector<HTMLElement>('[data-spot-marker]') ??
      el.querySelector<HTMLElement>('[data-label="ATM"]')
    if (!target) return
    centeredForRef.current = key
    el.scrollTop = target.offsetTop - el.clientHeight / 2 + target.offsetHeight / 2
  }, [data?.chain, selectedExchange, selectedUnderlying, selectedExpiry])

  const handleOrder = (action: 'BUY' | 'SELL', leg: OptionData) => {
    setOrderDialog({
      open: true,
      symbol: leg.symbol,
      exchange: selectedExchange,
      action,
      lotSize: leg.lotsize ?? 1,
      tickSize: leg.tick_size ?? 0.05,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Compact header: everything a trader needs to reorient, one row.
          Right-padded past the dialog's own absolutely-positioned close
          button (size-8 at top-4 right-4), or the spot price sits under it. */}
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
        <Select value={String(strikeCount)} onValueChange={(v) => setStrikeCount(Number(v))}>
          <SelectTrigger className="h-7 w-28 text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STRIKE_COUNTS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">
                {n} strikes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{selectedUnderlying}</span>
          <span className="font-mono font-semibold tabular-nums">
            {fmtPrice(data?.underlying_ltp)}
          </span>
          {spotChange && (
            <span
              className={cn(
                'font-mono tabular-nums',
                spotChange.change > 0 ? 'text-profit' : 'text-loss'
              )}
            >
              {spotChange.change > 0 ? '+' : ''}
              {spotChange.percent.toFixed(2)}%
            </span>
          )}
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              isStreaming ? 'bg-success' : 'bg-muted-foreground/40'
            )}
            title={isStreaming ? 'Streaming' : 'Polling'}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={() => refetch()}
            disabled={!selectedExpiry || isLoading}
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* CALLS / PUTS orientation, then the column headers beneath it. */}
      <div className="flex border-b bg-muted text-xs font-semibold tracking-wide text-muted-foreground">
        <div className="flex-1 px-2 py-1.5 text-right">CALLS</div>
        <div className="w-16 shrink-0" />
        <div className="flex-1 px-2 py-1.5 text-left">PUTS</div>
      </div>
      <div className="flex border-b bg-muted text-xs font-medium text-muted-foreground">
        <div className="flex flex-1 justify-end gap-2 px-2 py-1.5">
          <span className="w-11 text-right">OI</span>
          <span className="w-11 text-right">IV</span>
          <span className="w-12 text-right">Delta</span>
          <span className="w-16 text-right">LTP</span>
          <span className="w-14 text-right">Chg%</span>
        </div>
        <div className="flex w-16 shrink-0 items-center justify-center gap-0.5">
          Strike <ChevronDown className="size-3 opacity-50" />
        </div>
        <div className="flex flex-1 gap-2 px-2 py-1.5">
          <span className="w-14">Chg%</span>
          <span className="w-16">LTP</span>
          <span className="w-12">Delta</span>
          <span className="w-11">IV</span>
          <span className="w-11">OI</span>
        </div>
      </div>

      {/* Dense strike rows, ATM-centered on open. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {data?.chain.map((row: OptionStrike, i: number) => {
          const label = row.ce?.label ?? row.pe?.label ?? ''
          const isATM = label === 'ATM'
          return (
            <div key={row.strike}>
              {i === markerIndex && (
                <div
                  data-spot-marker
                  className="relative flex h-6 items-center justify-center bg-primary/5"
                >
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-primary" />
                  <span className="relative z-10 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                    {fmtPrice(spot)}
                  </span>
                </div>
              )}
              <div data-label={label} className="flex items-stretch hover:bg-accent/40">
                <LegCell
                  leg={row.ce}
                  side="ce"
                  itm={isInTheMoney('ce', row.strike, spot)}
                  isMax={oiLevels.ce === row.strike}
                  onOrder={handleOrder}
                />
                <div
                  className={cn(
                    'flex w-16 shrink-0 items-center justify-center font-mono text-sm font-semibold tabular-nums',
                    isATM ? 'bg-primary/12 text-primary' : 'bg-muted'
                  )}
                >
                  {row.strike}
                </div>
                <LegCell
                  leg={row.pe}
                  side="pe"
                  itm={isInTheMoney('pe', row.strike, spot)}
                  isMax={oiLevels.pe === row.strike}
                  onOrder={handleOrder}
                />
              </div>
              {/* OI, as a diverging bar sharing one center baseline at the
                  strike column: CE and PE lengths are directly comparable at
                  a glance, which a same-side gauge per leg could not give. */}
              <div className="flex h-[5px] border-b border-border/50">
                <div className="flex flex-1 justify-end">
                  <div
                    className="h-full rounded-l-sm bg-success/70"
                    style={{ width: `${row.ce?.oi ? Math.max((row.ce.oi / maxOi) * 100, 4) : 0}%` }}
                  />
                </div>
                <div className="w-16 shrink-0" />
                <div className="flex flex-1 justify-start">
                  <div
                    className="h-full rounded-r-sm bg-destructive/70"
                    style={{ width: `${row.pe?.oi ? Math.max((row.pe.oi / maxOi) * 100, 4) : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {!data && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
          </div>
        )}
      </div>

      <PlaceOrderDialog
        open={orderDialog?.open ?? false}
        onOpenChange={(open) => !open && setOrderDialog(null)}
        symbol={orderDialog?.symbol}
        exchange={orderDialog?.exchange}
        action={orderDialog?.action}
        quantity={orderDialog?.lotSize}
        lotSize={orderDialog?.lotSize}
        tickSize={orderDialog?.tickSize}
        strategy="OptionChain"
      />
    </div>
  )
}
