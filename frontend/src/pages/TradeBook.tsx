import { ArrowDown, ArrowUp, Download, Loader2, RefreshCw, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { tradingApi } from '@/api/trading'
import { CategorySection } from '@/components/trading/CategorySection'
import { ChartSymbolLink } from '@/components/trading/ChartSymbolLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'
import { useSupportedExchanges } from '@/hooks/useSupportedExchanges'
import { groupByInstrumentCategory, sortCategoryKeys } from '@/lib/instrumentCategory'
import { cn, makeFormatCurrency, sanitizeCSV } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { onModeChange } from '@/stores/themeStore'
import type { Trade } from '@/types/trading'
import { showToast } from '@/utils/toast'

interface FilterState {
  action: string[]
  exchange: string[]
  product: string[]
}

// Sort configuration types
type SortKey = 'timestamp' | 'symbol' | 'action'
interface SortConfig {
  key: SortKey
  direction: 'asc' | 'desc'
}

/**
 * Helper to convert various broker timestamp formats into a sortable number.
 * Ensures chronological accuracy for non-ISO formats.
 */
function parseTimestamp(timestamp: string): number {
  if (!timestamp) return 0

  let date = new Date(timestamp)

  // If invalid, try "HH:MM:SS DD-MM-YYYY" (Flattrade/Shoonya/Zebu/Firstock norentm format)
  if (Number.isNaN(date.getTime())) {
    const norentm = timestamp.match(/^(\d{2}:\d{2}:\d{2})\s+(\d{2})-(\d{2})-(\d{4})$/)
    if (norentm) {
      date = new Date(`${norentm[4]}-${norentm[3]}-${norentm[2]}T${norentm[1]}`)
    }
  }

  // If invalid, try "DD-MM-YYYY HH:MM:SS"
  if (Number.isNaN(date.getTime())) {
    const ddmmyyyy = timestamp.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2}:\d{2})$/)
    if (ddmmyyyy) {
      date = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T${ddmmyyyy[4]}`)
    }
  }

  return date.getTime() || 0
}

function formatTime(timestamp: string): string {
  if (!timestamp) return '-'

  const timeValue = parseTimestamp(timestamp)
  if (timeValue === 0) {
    // Last resort: extract HH:MM:SS if embedded in the string
    const timeMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})/)
    return timeMatch ? timeMatch[1] : timestamp
  }

  const date = new Date(timeValue)
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDateLabel(timestamp: string): string {
  const timeValue = parseTimestamp(timestamp)
  if (timeValue === 0) return 'Undated'
  return new Date(timeValue).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Same adjacency grouping as OrderBook -- groups consecutive same-date rows without re-sorting. */
function groupByDate<T extends { timestamp: string }>(items: T[]): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = []
  for (const item of items) {
    const label = formatDateLabel(item.timestamp)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
  }
  return groups
}

export default function TradeBook() {
  const { apiKey, user } = useAuthStore()
  const { isCrypto } = useSupportedExchanges()
  const formatCurrency = useMemo(() => makeFormatCurrency(user?.broker), [user?.broker])
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    action: [],
    exchange: [],
    product: [],
  })
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Sort state - Default: most recent first
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'timestamp',
    direction: 'desc',
  })

  // Filter and Sort trades
  const sortedAndFilteredTrades = useMemo(() => {
    // 1. Filter Logic
    const filtered = trades.filter((trade) => {
      if (filters.action.length > 0 && !filters.action.includes(trade.action)) return false
      if (filters.exchange.length > 0 && !filters.exchange.includes(trade.exchange)) return false
      if (filters.product.length > 0 && !filters.product.includes(trade.product)) return false
      return true
    })

    // 2. Sort Logic
    return [...filtered].sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]

      if (sortConfig.key === 'timestamp') {
        const aTime = parseTimestamp(aValue as string)
        const bTime = parseTimestamp(bValue as string)
        return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime
      }

      // Standard alphabetical sort for Symbol and Action
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }, [trades, filters, sortConfig])

  const tradesByCategory = useMemo(
    () =>
      groupByInstrumentCategory(
        sortedAndFilteredTrades,
        (t) => t.exchange,
        (t) => t.product
      ),
    [sortedAndFilteredTrades]
  )
  const categoryKeys = useMemo(
    () => sortCategoryKeys(Object.keys(tradesByCategory)),
    [tradesByCategory]
  )

  const requestSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const hasActiveFilters =
    filters.action.length > 0 || filters.exchange.length > 0 || filters.product.length > 0

  const toggleFilter = (type: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const arr = prev[type]
      const index = arr.indexOf(value)
      if (index > -1) {
        return { ...prev, [type]: arr.filter((v) => v !== value) }
      }
      return { ...prev, [type]: [...arr, value] }
    })
  }

  const clearFilters = () => {
    setFilters({ action: [], exchange: [], product: [] })
  }

  const fetchTrades = useCallback(
    async (showRefresh = false) => {
      if (!apiKey) {
        setIsLoading(false)
        return
      }

      if (showRefresh) setIsRefreshing(true)

      try {
        const response = await tradingApi.getTrades(apiKey)
        if (response.status === 'success' && response.data) {
          setTrades(response.data)
          setError(null)
        } else {
          setError(response.message || 'Failed to fetch trades')
        }
      } catch {
        setError('Failed to fetch trades')
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [apiKey]
  )

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  // Refresh on order events instead of polling
  useOrderEventRefresh(fetchTrades, {
    events: ['order_event', 'analyzer_update'],
  })

  // Listen for mode changes (live/analyze) and refresh data
  useEffect(() => {
    const unsubscribe = onModeChange(() => {
      fetchTrades()
    })
    return () => unsubscribe()
  }, [fetchTrades])

  const exportToCSV = () => {
    if (sortedAndFilteredTrades.length === 0) {
      showToast.error('No data to export', 'system')
      return
    }

    try {
      const headers = [
        'Symbol',
        'Exchange',
        ...(isCrypto ? [] : ['Product']),
        'Action',
        'Qty',
        'Price',
        'Trade Value',
        'Order ID',
        'Time',
      ]
      const rows = sortedAndFilteredTrades.map((t) => [
        sanitizeCSV(t.symbol),
        sanitizeCSV(t.exchange),
        ...(isCrypto ? [] : [sanitizeCSV(t.product)]),
        sanitizeCSV(t.action),
        sanitizeCSV(t.quantity),
        sanitizeCSV(t.average_price),
        sanitizeCSV(t.trade_value),
        sanitizeCSV(t.orderid),
        sanitizeCSV(t.timestamp),
      ])

      const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const filename = `tradebook_${new Date().toISOString().split('T')[0]}.csv`
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      showToast.success(`Downloaded ${filename}`, 'clipboard')
    } catch {
      showToast.error('Failed to export CSV', 'system')
    }
  }

  const stats = {
    total: sortedAndFilteredTrades.length,
    buyTrades: sortedAndFilteredTrades.filter((t) => t.action === 'BUY').length,
    sellTrades: sortedAndFilteredTrades.filter((t) => t.action === 'SELL').length,
  }

  const FilterChip = ({
    type,
    value,
    label,
  }: {
    type: keyof FilterState
    value: string
    label: string
  }) => (
    <Button
      variant={filters[type].includes(value) ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'rounded-full',
        filters[type].includes(value) && 'bg-primary hover:bg-primary/90'
      )}
      onClick={() => toggleFilter(type, value)}
    >
      {label}
    </Button>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trade Book</h1>
          <p className="text-muted-foreground">View your executed trades</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Settings Button */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button
                variant={hasActiveFilters ? 'default' : 'outline'}
                size="sm"
                className="relative"
                aria-label="Open trade filters"
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-destructive rounded-full" />
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Trade Filters</DialogTitle>
                <DialogDescription>Filter trades by action, exchange, or product</DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Action */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Action
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip type="action" value="BUY" label="Buy" />
                    <FilterChip type="action" value="SELL" label="Sell" />
                  </div>
                </div>

                {/* Exchange */}
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Exchange
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <FilterChip type="exchange" value="NSE" label="NSE" />
                    <FilterChip type="exchange" value="BSE" label="BSE" />
                    <FilterChip type="exchange" value="NFO" label="NFO" />
                    <FilterChip type="exchange" value="BFO" label="BFO" />
                    <FilterChip type="exchange" value="MCX" label="MCX" />
                    <FilterChip type="exchange" value="CDS" label="CDS" />
                  </div>
                </div>

                {/* Product */}
                {!isCrypto && (
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Product
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      <FilterChip type="product" value="CNC" label="CNC" />
                      <FilterChip type="product" value="MIS" label="MIS" />
                      <FilterChip type="product" value="NRML" label="NRML" />
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={clearFilters}>
                  Clear All
                </Button>
                <Button onClick={() => setSettingsOpen(false)}>Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTrades(true)}
            disabled={isRefreshing}
            aria-label="Refresh tradebook"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            aria-label="Export tradebook to CSV"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Active Filters Bar */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Active Filters:</span>
          {filters.action.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="bg-primary/10 text-primary border-primary/30"
            >
              {v}
            </Badge>
          ))}
          {filters.exchange.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="bg-primary/10 text-primary border-primary/30"
            >
              {v}
            </Badge>
          ))}
          {!isCrypto &&
            filters.product.map((v) => (
              <Badge
                key={v}
                variant="secondary"
                className="bg-primary/10 text-primary border-primary/30"
              >
                {v}
              </Badge>
            ))}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/50 hover:bg-destructive/10"
            onClick={clearFilters}
            aria-label="Clear active filters"
          >
            Clear All
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Trades</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Buy Trades</CardDescription>
            <CardTitle className="text-2xl text-buy">{stats.buyTrades}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sell Trades</CardDescription>
            <CardTitle className="text-2xl text-sell">{stats.sellTrades}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Trades, split into instrument-category sections */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">{error}</CardContent>
        </Card>
      ) : sortedAndFilteredTrades.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {hasActiveFilters ? (
              <div>
                <p className="mb-4">No trades match your filters</p>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              'No trades today'
            )}
          </CardContent>
        </Card>
      ) : (
        categoryKeys.map((categoryKey) => {
          const categoryTrades = tradesByCategory[categoryKey as keyof typeof tradesByCategory]
          const categoryDateGroups = groupByDate(categoryTrades)

          return (
            <CategorySection key={categoryKey} title={categoryKey} count={categoryTrades.length}>
              <div>
                <div className="hidden sm:flex items-center gap-4 px-1 pb-2 text-xs font-medium text-muted-foreground border-b">
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-1 text-left hover:text-foreground"
                    onClick={() => requestSort('symbol')}
                  >
                    Symbol
                    {sortConfig.key === 'symbol' &&
                      (sortConfig.direction === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                  <div className="w-28 text-right">Qty / Price</div>
                  <div className="w-28 text-right">Trade Value</div>
                  <button
                    type="button"
                    className="w-20 text-right flex items-center justify-end gap-1 hover:text-foreground"
                    onClick={() => requestSort('timestamp')}
                  >
                    Time
                    {sortConfig.key === 'timestamp' &&
                      (sortConfig.direction === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </button>
                </div>

                {categoryDateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-1 pt-4 pb-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((trade, index) => {
                        const meta = [trade.exchange, !isCrypto ? trade.product : null]
                          .filter(Boolean)
                          .join(' · ')

                        return (
                          <div
                            key={`${trade.orderid}-${index}`}
                            className="flex items-center gap-4 py-3 px-1 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">
                                <ChartSymbolLink symbol={trade.symbol} exchange={trade.exchange} />
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                <span
                                  className={cn(
                                    'font-medium',
                                    trade.action === 'BUY' ? 'text-buy' : 'text-sell'
                                  )}
                                >
                                  {trade.action === 'BUY' ? 'Buy' : 'Sell'}
                                </span>{' '}
                                &middot; {meta} &middot; {trade.orderid}
                              </div>
                            </div>
                            <div className="w-28 text-right shrink-0">
                              <div className="font-mono text-sm">{trade.quantity}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {formatCurrency(trade.average_price)}
                              </div>
                            </div>
                            <div className="w-28 text-right shrink-0 font-mono text-sm">
                              {formatCurrency(trade.trade_value)}
                            </div>
                            <div className="w-20 text-right shrink-0 text-xs text-muted-foreground">
                              {formatTime(trade.timestamp)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CategorySection>
          )
        })
      )}
    </div>
  )
}
