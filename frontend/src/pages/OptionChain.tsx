import { Check, ChevronsUpDown, RefreshCw, TrendingUp, Wifi, WifiOff } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { oiProfileApi } from '@/api/oi-profile'
import {
  BarSettingsDropdown,
  ColumnConfigDropdown,
  ColumnReorderPanel,
  ViewModeToggle,
} from '@/components/option-chain'
import { PlaceOrderDialog } from '@/components/trading'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useOptionChainLive } from '@/hooks/useOptionChainLive'
import { useOptionChainPreferences } from '@/hooks/useOptionChainPreferences'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import {
  changeFromClose,
  daysToExpiry,
  isInTheMoney,
  maxOiStrikes,
  spotMarkerIndex,
} from '@/lib/optionChainView'
import { serverSentence } from '@/lib/serverSentence'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import type { BarDataSource, BarStyle, ColumnKey, OptionStrike } from '@/types/option-chain'
import { COLUMN_DEFINITIONS } from '@/types/option-chain'
import { showToast } from '@/utils/toast'

// FNO_EXCHANGES and DEFAULT_UNDERLYINGS are now provided by useSupportedExchanges() hook

const STRIKE_COUNTS = [
  { value: 5, label: '5 strikes' },
  { value: 10, label: '10 strikes' },
  { value: 15, label: '15 strikes' },
  { value: 20, label: '20 strikes' },
  { value: 25, label: '25 strikes' },
]

// Format number in lakhs (divide by 100000)
function formatInLakhs(num: number | undefined | null): string {
  if (num === undefined || num === null || num === 0) return '0'
  const lakhs = num / 100000
  if (lakhs >= 100) {
    return `${lakhs.toFixed(0)}L`
  } else if (lakhs >= 10) {
    return `${lakhs.toFixed(1)}L`
  } else if (lakhs >= 1) {
    return `${lakhs.toFixed(2)}L`
  } else {
    // Less than 1 lakh, show in thousands
    const thousands = num / 1000
    if (thousands >= 1) {
      return `${thousands.toFixed(1)}K`
    }
    return num.toLocaleString()
  }
}

function formatPrice(num: number | undefined | null): string {
  if (num === undefined || num === null) return '0.00'
  return num.toFixed(2)
}

/**
 * Format a Greek, rendering a dash when it is not computable for that leg.
 *
 * A missing Greek is genuinely absent (no quote, expired chain, or an
 * unconvergeable price) and must not be shown as 0.00, which a trader would
 * read as a real value.
 */
function formatGreek(num: number | undefined | null, decimals: number): string {
  if (num === undefined || num === null || !Number.isFinite(num)) return '-'
  return num.toFixed(decimals)
}

/** Dim the placeholder dash so absent Greeks recede instead of reading as data. */
function greekMutedClass(num: number | undefined | null): string {
  return num === undefined || num === null || !Number.isFinite(num)
    ? 'text-muted-foreground/50'
    : ''
}

function convertExpiryForAPI(expiry: string): string {
  if (!expiry) return ''
  const parts = expiry.split('-')
  if (parts.length === 3) {
    return `${parts[0]}${parts[1].toUpperCase()}${parts[2].slice(-2)}`
  }
  return expiry.replace(/-/g, '').toUpperCase()
}

function calculatePCR(chain: OptionStrike[]): number {
  let totalCeOi = 0
  let totalPeOi = 0

  chain.forEach((strike) => {
    if (strike.ce?.oi) totalCeOi += strike.ce.oi
    if (strike.pe?.oi) totalPeOi += strike.pe?.oi ?? 0
  })

  if (totalCeOi === 0) return 0
  return totalPeOi / totalCeOi
}

function calculateTotals(chain: OptionStrike[]): {
  ceVolume: number
  peVolume: number
  ceOi: number
  peOi: number
} {
  let ceVolume = 0
  let peVolume = 0
  let ceOi = 0
  let peOi = 0

  chain.forEach((strike) => {
    if (strike.ce) {
      ceVolume += strike.ce.volume ?? 0
      ceOi += strike.ce.oi ?? 0
    }
    if (strike.pe) {
      peVolume += strike.pe.volume ?? 0
      peOi += strike.pe.oi ?? 0
    }
  })

  return { ceVolume, peVolume, ceOi, peOi }
}

function getMaxValue(chain: OptionStrike[], dataSource: BarDataSource): number {
  let maxVal = 0
  chain.forEach((strike) => {
    const ceVal = dataSource === 'oi' ? strike.ce?.oi : strike.ce?.volume
    const peVal = dataSource === 'oi' ? strike.pe?.oi : strike.pe?.volume
    if (ceVal && ceVal > maxVal) maxVal = ceVal
    if (peVal && peVal > maxVal) maxVal = peVal
  })
  return maxVal || 1
}

interface PlaceOrderParams {
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  lotSize: number
  tickSize: number
}

interface OptionChainRowProps {
  strike: OptionStrike
  previousStrike: OptionStrike | undefined
  maxBarValue: number
  visibleCeColumns: ColumnKey[]
  visiblePeColumns: ColumnKey[]
  barDataSource: BarDataSource
  barStyle: BarStyle
  optionExchange: string
  onPlaceOrder: (params: PlaceOrderParams) => void
  /** Live underlying price: decides which side of this strike is in the money. */
  spot: number
  /** This strike carries the most call / put open interest in the chain. */
  isMaxCeOi: boolean
  isMaxPeOi: boolean
}

/**
 * Buy / sell buttons for one leg. Revealed on row hover and on keyboard focus,
 * so they are reachable without a mouse, and named in full for screen readers
 * and the tooltip ("Buy NIFTY29SEP2623150CE"), since "B" alone says nothing.
 */
function LegOrderButtons({
  symbol,
  align,
  onOrder,
}: {
  symbol: string
  align: 'left' | 'right'
  onOrder: (action: 'BUY' | 'SELL') => void
}) {
  return (
    <div
      className={cn(
        'absolute top-1/2 z-20 flex -translate-y-1/2 gap-1',
        align === 'right' ? 'right-1.5' : 'left-1.5',
        'opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
      )}
    >
      {(['BUY', 'SELL'] as const).map((action) => {
        const label = `${action === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`
        return (
          <Tooltip key={action}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                onClick={(e) => {
                  e.stopPropagation()
                  onOrder(action)
                }}
                className={cn(
                  'h-6 min-w-6 rounded-md px-1.5 text-[11px] font-bold shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  action === 'BUY'
                    ? 'bg-buy text-buy-foreground hover:bg-buy/90'
                    : 'bg-sell text-sell-foreground hover:bg-sell/90'
                )}
              >
                {action === 'BUY' ? 'B' : 'S'}
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** LTP with its change from the previous close underneath, as most chains show it. */
function LtpCell({
  ltp,
  prevClose,
  flashClass,
}: {
  ltp: number | undefined
  prevClose: number | undefined
  flashClass: string
}) {
  const chg = changeFromClose(ltp, prevClose)
  return (
    <span className={cn('inline-flex flex-col items-end leading-tight rounded px-1', flashClass)}>
      <span className="font-mono text-xs font-semibold tabular-nums">{formatPrice(ltp)}</span>
      {chg && (
        <span
          className={cn(
            'font-mono text-[10px] tabular-nums',
            chg.change > 0 ? 'text-profit' : chg.change < 0 ? 'text-loss' : 'text-muted-foreground'
          )}
        >
          {chg.change > 0 ? '+' : ''}
          {chg.percent.toFixed(2)}%
        </span>
      )}
    </span>
  )
}

// Memoized row component to prevent unnecessary re-renders
const OptionChainRow = React.memo(function OptionChainRow({
  strike,
  previousStrike,
  maxBarValue,
  visibleCeColumns,
  visiblePeColumns,
  barDataSource,
  barStyle,
  optionExchange,
  onPlaceOrder,
  spot,
  isMaxCeOi,
  isMaxPeOi,
}: OptionChainRowProps) {
  const ce = strike.ce
  const pe = strike.pe
  const label = ce?.label ?? pe?.label ?? ''
  const isATM = label === 'ATM'

  // Shade the in-the-money side, the convention every chain is read by: calls
  // below spot, puts above it.
  const isCeITM = isInTheMoney('ce', strike.strike, spot)
  const isPeITM = isInTheMoney('pe', strike.strike, spot)

  // Flash animation for LTP changes
  const ceLtpChanged = previousStrike?.ce?.ltp !== undefined && previousStrike.ce.ltp !== ce?.ltp
  const peLtpChanged = previousStrike?.pe?.ltp !== undefined && previousStrike.pe.ltp !== pe?.ltp

  const ceFlashClass = ceLtpChanged
    ? ce && previousStrike?.ce && ce.ltp > previousStrike.ce.ltp
      ? 'bg-profit/30'
      : 'bg-loss/30'
    : ''
  const peFlashClass = peLtpChanged
    ? pe && previousStrike?.pe && pe.ltp > previousStrike.pe.ltp
      ? 'bg-profit/30'
      : 'bg-loss/30'
    : ''

  const ceSpread = ce && ce.bid > 0 && ce.ask > 0 ? ce.ask - ce.bid : 0
  const peSpread = pe && pe.bid > 0 && pe.ask > 0 ? pe.ask - pe.bid : 0

  // Tight, fair, wide: one scale for both sides.
  const spreadClass = (spread: number) =>
    spread <= 1 ? 'text-success' : spread <= 2 ? 'text-warning' : 'text-destructive'
  const ceSpreadClass = spreadClass(ceSpread)
  const peSpreadClass = spreadClass(peSpread)

  // Bar values based on data source
  const ceBarValue = barDataSource === 'oi' ? ce?.oi : ce?.volume
  const peBarValue = barDataSource === 'oi' ? pe?.oi : pe?.volume
  const ceBarPercent = ceBarValue ? Math.min((ceBarValue / maxBarValue) * 100, 100) : 0
  const peBarPercent = peBarValue ? Math.min((peBarValue / maxBarValue) * 100, 100) : 0

  // Bar styles
  // Kept light: the bar sits on top of the ITM shading, and at full strength
  // the two blend into one muddy block in dark mode.
  const ceBarClass =
    barStyle === 'gradient' ? 'bg-gradient-to-r from-success/20 to-transparent' : 'bg-success/12'
  const peBarClass =
    barStyle === 'gradient'
      ? 'bg-gradient-to-l from-destructive/20 to-transparent'
      : 'bg-destructive/12'

  // Use tabular-nums for consistent number widths to prevent layout shifts
  const numClass = 'font-mono tabular-nums text-xs'

  const getCeColumnValue = (key: ColumnKey) => {
    switch (key) {
      case 'ce_oi':
        return (
          <span className={cn(numClass, isMaxCeOi && 'font-bold text-foreground')}>
            {formatInLakhs(ce?.oi)}
          </span>
        )
      case 'ce_volume':
        return <span className={numClass}>{formatInLakhs(ce?.volume)}</span>
      case 'ce_bid_qty':
        return <span className={numClass}>{ce?.bid_qty ?? 0}</span>
      case 'ce_bid':
        return <span className={cn(numClass, 'text-buy')}>{formatPrice(ce?.bid)}</span>
      case 'ce_ltp':
        return <LtpCell ltp={ce?.ltp} prevClose={ce?.prev_close} flashClass={ceFlashClass} />
      case 'ce_ask':
        return <span className={cn(numClass, 'text-sell')}>{formatPrice(ce?.ask)}</span>
      case 'ce_ask_qty':
        return <span className={numClass}>{ce?.ask_qty ?? 0}</span>
      case 'ce_spread':
        return <span className={cn(numClass, ceSpreadClass)}>{formatPrice(ceSpread)}</span>
      case 'ce_iv':
        return (
          <span className={cn(numClass, 'font-semibold', greekMutedClass(ce?.implied_volatility))}>
            {formatGreek(ce?.implied_volatility, 2)}
          </span>
        )
      case 'ce_delta':
        return (
          <span className={cn(numClass, greekMutedClass(ce?.delta))}>
            {formatGreek(ce?.delta, 4)}
          </span>
        )
      case 'ce_gamma':
        return (
          <span className={cn(numClass, greekMutedClass(ce?.gamma))}>
            {formatGreek(ce?.gamma, 4)}
          </span>
        )
      case 'ce_theta':
        return (
          <span className={cn(numClass, greekMutedClass(ce?.theta))}>
            {formatGreek(ce?.theta, 2)}
          </span>
        )
      case 'ce_vega':
        return (
          <span className={cn(numClass, greekMutedClass(ce?.vega))}>
            {formatGreek(ce?.vega, 2)}
          </span>
        )
      default:
        return null
    }
  }

  const getPeColumnValue = (key: ColumnKey) => {
    switch (key) {
      case 'pe_oi':
        return (
          <span className={cn(numClass, isMaxPeOi && 'font-bold text-foreground')}>
            {formatInLakhs(pe?.oi)}
          </span>
        )
      case 'pe_volume':
        return <span className={numClass}>{formatInLakhs(pe?.volume)}</span>
      case 'pe_bid_qty':
        return <span className={numClass}>{pe?.bid_qty ?? 0}</span>
      case 'pe_bid':
        return <span className={cn(numClass, 'text-buy')}>{formatPrice(pe?.bid)}</span>
      case 'pe_ltp':
        return <LtpCell ltp={pe?.ltp} prevClose={pe?.prev_close} flashClass={peFlashClass} />
      case 'pe_ask':
        return <span className={cn(numClass, 'text-sell')}>{formatPrice(pe?.ask)}</span>
      case 'pe_ask_qty':
        return <span className={numClass}>{pe?.ask_qty ?? 0}</span>
      case 'pe_spread':
        return <span className={cn(numClass, peSpreadClass)}>{formatPrice(peSpread)}</span>
      case 'pe_iv':
        return (
          <span className={cn(numClass, 'font-semibold', greekMutedClass(pe?.implied_volatility))}>
            {formatGreek(pe?.implied_volatility, 2)}
          </span>
        )
      case 'pe_delta':
        return (
          <span className={cn(numClass, greekMutedClass(pe?.delta))}>
            {formatGreek(pe?.delta, 4)}
          </span>
        )
      case 'pe_gamma':
        return (
          <span className={cn(numClass, greekMutedClass(pe?.gamma))}>
            {formatGreek(pe?.gamma, 4)}
          </span>
        )
      case 'pe_theta':
        return (
          <span className={cn(numClass, greekMutedClass(pe?.theta))}>
            {formatGreek(pe?.theta, 2)}
          </span>
        )
      case 'pe_vega':
        return (
          <span className={cn(numClass, greekMutedClass(pe?.vega))}>
            {formatGreek(pe?.vega, 2)}
          </span>
        )
      default:
        return null
    }
  }

  return (
    <TableRow
      className="group relative hover:bg-accent/50 focus-within:bg-accent/50"
      data-strike={strike.strike}
      data-label={label}
    >
      {/* CE cells */}
      {visibleCeColumns.length > 0 && (
        <TableCell className={cn('p-0 relative border-r border-border', isCeITM && 'bg-warning/8')}>
          {/* CE bar - spans the entire CE section */}
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 pointer-events-none z-0 transition-all duration-300',
              ceBarClass
            )}
            style={{ width: `${ceBarPercent}%` }}
          />
          {/* Buy/Sell buttons, next to the strike column */}
          {ce && (
            <LegOrderButtons
              symbol={ce.symbol}
              align="right"
              onOrder={(action) =>
                onPlaceOrder({
                  symbol: ce.symbol,
                  exchange: optionExchange,
                  action,
                  lotSize: ce.lotsize ?? 1,
                  tickSize: ce.tick_size ?? 0.05,
                })
              }
            />
          )}
          <div className="relative z-10 flex">
            {visibleCeColumns.map((key) => {
              const colDef = COLUMN_DEFINITIONS.find((c) => c.key === key)
              return (
                <div
                  key={key}
                  className={cn(
                    'flex-1 px-2 py-1.5 min-w-0',
                    colDef?.align === 'right' && 'text-right',
                    colDef?.align === 'center' && 'text-center',
                    colDef?.align === 'left' && 'text-left'
                  )}
                >
                  {getCeColumnValue(key)}
                </div>
              )
            })}
          </div>
        </TableCell>
      )}

      {/* Strike cell - center column */}
      <TableCell
        className={cn(
          'w-24 min-w-24 px-2 py-1.5 text-center font-mono text-sm font-semibold tabular-nums',
          isATM ? 'bg-primary/12 text-primary' : 'bg-muted'
        )}
      >
        <span className="inline-flex flex-col items-center leading-tight">
          {strike.strike}
          {(isATM || isMaxCeOi || isMaxPeOi) && (
            <span className="font-sans text-[9px] font-semibold tracking-wide uppercase">
              {isATM && <span className="text-primary">ATM</span>}
              {isMaxCeOi && (
                <span className="text-loss" title="Highest call OI: resistance">
                  {isATM ? ' ' : ''}R
                </span>
              )}
              {isMaxPeOi && (
                <span className="text-profit" title="Highest put OI: support">
                  {isATM || isMaxCeOi ? ' ' : ''}S
                </span>
              )}
            </span>
          )}
        </span>
      </TableCell>

      {/* PE cells */}
      {visiblePeColumns.length > 0 && (
        <TableCell className={cn('p-0 relative border-l border-border', isPeITM && 'bg-warning/8')}>
          {/* PE bar - spans the entire PE section from right */}
          <div
            className={cn(
              'absolute right-0 top-0 bottom-0 pointer-events-none z-0 transition-all duration-300',
              peBarClass
            )}
            style={{ width: `${peBarPercent}%` }}
          />
          {/* Buy/Sell buttons, next to the strike column */}
          {pe && (
            <LegOrderButtons
              symbol={pe.symbol}
              align="left"
              onOrder={(action) =>
                onPlaceOrder({
                  symbol: pe.symbol,
                  exchange: optionExchange,
                  action,
                  lotSize: pe.lotsize ?? 1,
                  tickSize: pe.tick_size ?? 0.05,
                })
              }
            />
          )}
          <div className="relative z-10 flex">
            {visiblePeColumns.map((key) => {
              const colDef = COLUMN_DEFINITIONS.find((c) => c.key === key)
              return (
                <div
                  key={key}
                  className={cn(
                    'flex-1 px-2 py-1.5 min-w-0',
                    colDef?.align === 'right' && 'text-right',
                    colDef?.align === 'center' && 'text-center',
                    colDef?.align === 'left' && 'text-left'
                  )}
                >
                  {getPeColumnValue(key)}
                </div>
              )
            })}
          </div>
        </TableCell>
      )}
    </TableRow>
  )
})

/**
 * The line between the two strikes the underlying is trading between, with the
 * spot price on it: where a trader's eye starts on any chain.
 */
function SpotMarkerRow({ label, spot, colSpan }: { label: string; spot: number; colSpan: number }) {
  return (
    <TableRow data-spot-marker className="border-0 hover:bg-transparent">
      <TableCell colSpan={colSpan} className="relative h-0 p-0">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary" />
        <div className="relative z-10 my-1 flex justify-center">
          <span className="rounded-full bg-primary px-3 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary-foreground shadow-sm">
            {label} {formatPrice(spot)}
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function OptionChain() {
  const { apiKey } = useAuthStore()
  const {
    toolsFnoExchanges: fnoExchanges,
    defaultToolsFnoExchange: defaultFnoExchange,
    defaultUnderlyings,
  } = useSupportedExchanges()
  const {
    viewMode,
    visibleColumns,
    columnOrder,
    strikeCount,
    selectedUnderlying,
    barDataSource,
    barStyle,
    setViewMode,
    toggleColumn,
    reorderColumns,
    setStrikeCount,
    setSelectedUnderlying,
    setBarDataSource,
    setBarStyle,
    resetToDefaults,
  } = useOptionChainPreferences()

  const [selectedExchange, setSelectedExchange] = useState(defaultFnoExchange)
  const [underlyings, setUnderlyings] = useState<string[]>(
    defaultUnderlyings[defaultFnoExchange] || []
  )
  const [underlyingOpen, setUnderlyingOpen] = useState(false)
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [expiries, setExpiries] = useState<string[]>([])
  // Use ref for previous data to avoid causing re-renders and enable proper flash animation
  const previousDataRef = useRef<Map<number, OptionStrike>>(new Map())
  const [orderDialog, setOrderDialog] = useState<{
    open: boolean
    symbol: string
    exchange: string
    action: 'BUY' | 'SELL'
    quantity: number
    lotSize: number
    tickSize: number
  } | null>(null)

  // Re-sync exchange when broker capabilities load asynchronously
  useEffect(() => {
    setSelectedExchange((prev) =>
      prev && fnoExchanges.some((ex) => ex.value === prev) ? prev : defaultFnoExchange
    )
  }, [defaultFnoExchange, fnoExchanges])

  const optionExchange = selectedExchange
  // Send NFO/BFO directly — backend resolves correct exchange for index vs stock
  const exchange = selectedExchange

  const {
    data,
    isConnected,
    isStreaming,
    isPaused,
    error,
    lastUpdate,
    refetch,
    isLoading,
    streamingSymbols,
  } = useOptionChainLive(
    apiKey,
    selectedUnderlying,
    exchange,
    optionExchange,
    convertExpiryForAPI(selectedExpiry),
    strikeCount,
    { enabled: !!selectedExpiry, oiRefreshInterval: 30000, pauseWhenHidden: true }
  )

  // Fetch underlyings when exchange changes
  useEffect(() => {
    const defaults = defaultUnderlyings[selectedExchange] || []
    setUnderlyings(defaults)
    setSelectedUnderlying(defaults[0] || '')
    setExpiries([])
    setSelectedExpiry('')

    let cancelled = false
    const fetchUnderlyings = async () => {
      try {
        const response = await oiProfileApi.getUnderlyings(selectedExchange)
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
    }
    fetchUnderlyings()
    return () => {
      cancelled = true
    }
  }, [selectedExchange, defaultUnderlyings[selectedExchange], setSelectedUnderlying])

  // Fetch expiries when underlying changes
  useEffect(() => {
    if (!selectedUnderlying) return
    setExpiries([])
    setSelectedExpiry('')

    let cancelled = false
    const fetchExpiries = async () => {
      try {
        const response = await oiProfileApi.getExpiries(selectedExchange, selectedUnderlying)
        if (cancelled) return
        if (response.status === 'success' && response.expiries.length > 0) {
          setExpiries(response.expiries)
          setSelectedExpiry(response.expiries[0])
        } else {
          setExpiries([])
          setSelectedExpiry('')
        }
      } catch (error) {
        if (cancelled) return
        showToast.error(serverSentence(error, 'Failed to load expiry dates'))
      }
    }
    fetchExpiries()
    return () => {
      cancelled = true
    }
  }, [selectedUnderlying, selectedExchange])

  // Update previous data ref after render (for flash animation)
  // Using useEffect to update AFTER the current data is rendered
  useEffect(() => {
    if (data?.chain) {
      // Schedule the ref update for after render so the current render uses old previous data
      const timeoutId = setTimeout(() => {
        const newMap = new Map<number, OptionStrike>()
        data.chain.forEach((strike) => {
          newMap.set(strike.strike, strike)
        })
        previousDataRef.current = newMap
      }, 100) // Short delay to allow flash animation to show
      return () => clearTimeout(timeoutId)
    }
  }, [data?.chain])

  // Keyboard shortcut: G flips Price <-> Greeks. Ignored while the user is
  // typing, so it does not hijack the underlying search box.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'g' || e.ctrlKey || e.metaKey || e.altKey) return

      const target = e.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      e.preventDefault()
      setViewMode(viewMode === 'greeks' ? 'price' : 'greeks')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, setViewMode])

  const handleUnderlyingChange = (value: string) => {
    setSelectedUnderlying(value)
    setSelectedExpiry('')
    setExpiries([])
  }

  // Clear underlying / expiry / expiries in the SAME React event as the
  // exchange change, so the next render has expiry='' (which makes the
  // polling hook's enabled flag false) BEFORE useOptionChainPolling's
  // dependency-driven effect fires a fetch with the new exchange and the
  // previous exchange's underlying / expiry.
  const handleExchangeChange = (value: string) => {
    if (value === selectedExchange) return
    setSelectedExchange(value)
    setSelectedUnderlying('')
    setExpiries([])
    setSelectedExpiry('')
  }

  const handleRefresh = () => {
    refetch()
  }

  const handlePlaceOrder = useCallback((params: PlaceOrderParams) => {
    setOrderDialog({
      open: true,
      symbol: params.symbol,
      exchange: params.exchange,
      action: params.action,
      quantity: params.lotSize,
      lotSize: params.lotSize,
      tickSize: params.tickSize,
    })
  }, [])

  // Memoized callback for dialog close to prevent re-renders
  const handleOrderDialogClose = useCallback((open: boolean) => {
    if (!open) setOrderDialog(null)
  }, [])

  const pcr = useMemo(() => (data?.chain ? calculatePCR(data.chain) : 0), [data?.chain])
  const totals = useMemo(
    () =>
      data?.chain ? calculateTotals(data.chain) : { ceVolume: 0, peVolume: 0, ceOi: 0, peOi: 0 },
    [data?.chain]
  )
  const maxBarValue = useMemo(
    () => (data?.chain ? getMaxValue(data.chain, barDataSource) : 1),
    [data?.chain, barDataSource]
  )
  const spot = data?.underlying_ltp ?? 0
  const oiLevels = useMemo(
    () => (data?.chain ? maxOiStrikes(data.chain) : { ce: null, pe: null }),
    [data?.chain]
  )
  const markerIndex = useMemo(
    () => (data?.chain ? spotMarkerIndex(data.chain, spot) : -1),
    [data?.chain, spot]
  )
  const spotChange = changeFromClose(data?.underlying_ltp, data?.underlying_prev_close)
  const dte = selectedExpiry ? daysToExpiry(selectedExpiry) : null

  // Open on the money. A chain of 20+ strikes is read outward from spot, so
  // land there once per underlying and expiry, then leave the scroll to the
  // trader: live updates must not yank the view back.
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const centeredForRef = useRef('')
  useEffect(() => {
    const key = `${selectedExchange}:${selectedUnderlying}:${selectedExpiry}`
    const el = tableScrollRef.current
    if (!data?.chain?.length || !el || centeredForRef.current === key) return
    const target =
      el.querySelector<HTMLElement>('[data-spot-marker]') ??
      el.querySelector<HTMLElement>('[data-label="ATM"]')
    if (!target) return
    centeredForRef.current = key
    el.scrollTop = target.offsetTop - el.clientHeight / 2 + target.offsetHeight / 2
  }, [data?.chain, selectedExchange, selectedUnderlying, selectedExpiry])

  // Get ordered visible columns for each side
  const visibleCeColumns = useMemo(() => {
    return columnOrder.filter((key) => {
      const col = COLUMN_DEFINITIONS.find((c) => c.key === key)
      return col?.side === 'ce' && visibleColumns.includes(key)
    })
  }, [columnOrder, visibleColumns])

  const visiblePeColumns = useMemo(() => {
    return columnOrder.filter((key) => {
      const col = COLUMN_DEFINITIONS.find((c) => c.key === key)
      return col?.side === 'pe' && visibleColumns.includes(key)
    })
  }, [columnOrder, visibleColumns])

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <Card className="max-w-md">
          <CardContent className="p-6">
            <div className="text-center text-destructive">
              <h2 className="text-xl font-bold mb-2">Error Loading Option Chain</h2>
              <p>{error}</p>
              <Button onClick={handleRefresh} className="mt-4">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-6 text-primary" />
          <h1 className="font-heading text-3xl font-bold tracking-tight">Option Chain</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedExchange} onValueChange={handleExchangeChange}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder="Exchange" />
            </SelectTrigger>
            <SelectContent>
              {fnoExchanges.map((ex) => (
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
                className="w-36 justify-between"
              >
                {selectedUnderlying || 'Select Underlying'}
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
                          handleUnderlyingChange(u)
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
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Select Expiry" />
            </SelectTrigger>
            <SelectContent>
              {expiries.map((exp) => (
                <SelectItem key={exp} value={exp}>
                  {exp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(strikeCount)} onValueChange={(v) => setStrikeCount(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Strike Count" />
            </SelectTrigger>
            <SelectContent>
              {STRIKE_COUNTS.map((sc) => (
                <SelectItem key={sc.value} value={String(sc.value)}>
                  {sc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
          <BarSettingsDropdown
            barDataSource={barDataSource}
            barStyle={barStyle}
            onBarDataSourceChange={setBarDataSource}
            onBarStyleChange={setBarStyle}
          />
          <ColumnConfigDropdown
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetToDefaults={resetToDefaults}
          />
          <ColumnReorderPanel
            columnOrder={columnOrder}
            visibleColumns={visibleColumns}
            onReorderColumns={reorderColumns}
          />
          <Button onClick={handleRefresh} disabled={!selectedExpiry || isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <div className="text-sm text-muted-foreground">{selectedUnderlying} spot</div>
                <div className="font-heading text-2xl font-bold tabular-nums">
                  {formatPrice(data.underlying_ltp)}
                </div>
                <div
                  className={cn(
                    'text-xs tabular-nums',
                    spotChange && spotChange.change > 0 && 'text-profit',
                    spotChange && spotChange.change < 0 && 'text-loss',
                    (!spotChange || spotChange.change === 0) && 'text-muted-foreground'
                  )}
                >
                  {spotChange
                    ? `${spotChange.change > 0 ? '+' : ''}${spotChange.change.toFixed(2)} (${spotChange.change > 0 ? '+' : ''}${spotChange.percent.toFixed(2)}%)`
                    : `Prev close ${formatPrice(data.underlying_prev_close)}`}
                </div>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <div className="text-sm text-muted-foreground">ATM strike</div>
                <div className="font-heading text-2xl font-bold tabular-nums">
                  {data.atm_strike}
                </div>
                <div className="text-xs text-muted-foreground">
                  Expiry {data.expiry_date}
                  {dte !== null &&
                    dte >= 0 &&
                    ` · ${dte === 0 ? 'expires today' : `${dte} day${dte === 1 ? '' : 's'} left`}`}
                </div>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <div className="text-sm text-muted-foreground">Put/call ratio (OI)</div>
                <div className="font-heading text-2xl font-bold tabular-nums">{pcr.toFixed(2)}</div>
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-profit/70 transition-all duration-500"
                    style={{
                      width:
                        totals.ceOi + totals.peOi > 0
                          ? `${(totals.peOi / (totals.ceOi + totals.peOi)) * 100}%`
                          : '0%',
                    }}
                  />
                  <div className="h-full flex-1 bg-loss/70" />
                </div>
                <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                  <span>Puts {formatInLakhs(totals.peOi)}</span>
                  <span>Calls {formatInLakhs(totals.ceOi)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardContent className="px-4">
                <div className="text-sm text-muted-foreground">OI levels</div>
                <div className="mt-1 space-y-1 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground">Resistance</span>
                    <span className="font-mono font-semibold tabular-nums text-loss">
                      {oiLevels.ce ?? '-'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground">Support</span>
                    <span className="font-mono font-semibold tabular-nums text-profit">
                      {oiLevels.pe ?? '-'}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Highest call / put OI</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              {/* One scroll box for both axes, so the header can stick while
                  the strikes scroll. The Table's own wrapper is told not to
                  scroll, or it would capture the sticky header instead. */}
              <div
                ref={tableScrollRef}
                className="relative max-h-[calc(100vh-17rem)] min-h-80 overflow-auto [&>[data-slot=table-container]]:overflow-visible"
              >
                <Table className="w-full min-w-[900px] table-fixed">
                  <TableHeader className="sticky top-0 z-30 bg-card shadow-[0_1px_0_var(--border)]">
                    {/* Section headers row */}
                    <TableRow className="border-b-0 bg-card hover:bg-card">
                      {visibleCeColumns.length > 0 && (
                        <TableHead className="border-r border-border bg-card text-center text-sm font-bold tracking-wide text-foreground normal-case">
                          CALLS
                          <span className="ml-2 font-normal text-muted-foreground">
                            ITM shaded below spot
                          </span>
                        </TableHead>
                      )}
                      <TableHead className="w-24 min-w-24 bg-card text-center" />
                      {visiblePeColumns.length > 0 && (
                        <TableHead className="border-l border-border bg-card text-center text-sm font-bold tracking-wide text-foreground normal-case">
                          PUTS
                          <span className="ml-2 font-normal text-muted-foreground">
                            ITM shaded above spot
                          </span>
                        </TableHead>
                      )}
                    </TableRow>
                    {/* Column headers row */}
                    <TableRow className="bg-muted hover:bg-muted">
                      {visibleCeColumns.length > 0 && (
                        <TableHead className="border-r border-border bg-muted p-0">
                          <div className="flex">
                            {visibleCeColumns.map((key) => {
                              const colDef = COLUMN_DEFINITIONS.find((c) => c.key === key)
                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    'flex-1 px-2 py-2 text-xs font-medium min-w-0',
                                    colDef?.align === 'right' && 'text-right',
                                    colDef?.align === 'center' && 'text-center',
                                    colDef?.align === 'left' && 'text-left'
                                  )}
                                >
                                  {colDef?.label}
                                </div>
                              )
                            })}
                          </div>
                        </TableHead>
                      )}
                      <TableHead className="w-24 min-w-24 bg-muted text-center text-xs">
                        Strike
                      </TableHead>
                      {visiblePeColumns.length > 0 && (
                        <TableHead className="border-l border-border bg-muted p-0">
                          <div className="flex">
                            {visiblePeColumns.map((key) => {
                              const colDef = COLUMN_DEFINITIONS.find((c) => c.key === key)
                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    'flex-1 px-2 py-2 text-xs font-medium min-w-0',
                                    colDef?.align === 'right' && 'text-right',
                                    colDef?.align === 'center' && 'text-center',
                                    colDef?.align === 'left' && 'text-left'
                                  )}
                                >
                                  {colDef?.label}
                                </div>
                              )
                            })}
                          </div>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.chain.map((strike, i) => (
                      <React.Fragment key={strike.strike}>
                        {i === markerIndex && (
                          <SpotMarkerRow
                            label={selectedUnderlying}
                            spot={spot}
                            colSpan={
                              1 +
                              (visibleCeColumns.length > 0 ? 1 : 0) +
                              (visiblePeColumns.length > 0 ? 1 : 0)
                            }
                          />
                        )}
                        <OptionChainRow
                          strike={strike}
                          previousStrike={previousDataRef.current.get(strike.strike)}
                          maxBarValue={maxBarValue}
                          visibleCeColumns={visibleCeColumns}
                          visiblePeColumns={visiblePeColumns}
                          barDataSource={barDataSource}
                          barStyle={barStyle}
                          optionExchange={optionExchange}
                          onPlaceOrder={handlePlaceOrder}
                          spot={spot}
                          isMaxCeOi={oiLevels.ce === strike.strike}
                          isMaxPeOi={oiLevels.pe === strike.strike}
                        />
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {isStreaming ? (
                  <Wifi className="h-4 w-4 text-success" />
                ) : (
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                )}
                <Badge
                  variant={isStreaming ? 'default' : isConnected ? 'secondary' : 'destructive'}
                >
                  {isPaused
                    ? 'Paused'
                    : isStreaming
                      ? `Streaming ${streamingSymbols} symbols`
                      : isConnected
                        ? 'Polling'
                        : 'Disconnected'}
                </Badge>
              </div>
              <div className="text-xs">
                Bar: {barDataSource === 'oi' ? 'OI' : 'Volume'} ({barStyle})
              </div>
            </div>
            <div>Last Update: {lastUpdate ? lastUpdate.toLocaleTimeString() : '-'}</div>
          </div>
        </>
      )}

      {!data && !error && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Place Order Dialog */}
      <PlaceOrderDialog
        open={orderDialog?.open ?? false}
        onOpenChange={handleOrderDialogClose}
        symbol={orderDialog?.symbol}
        exchange={orderDialog?.exchange}
        action={orderDialog?.action}
        quantity={orderDialog?.quantity}
        lotSize={orderDialog?.lotSize}
        tickSize={orderDialog?.tickSize}
        strategy="OptionChain"
      />
    </div>
  )
}
