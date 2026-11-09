import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { TopInstrumentCard } from '@/components/dashboard/TopInstrumentCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { COMMODITY_TICKER_SYMBOLS, INDEX_TICKER_SYMBOLS } from '@/config/tickerSymbols'
import { useOrderEventRefresh } from '@/hooks/useOrderEventRefresh'
import { cn, makeFormatCurrency } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { onModeChange } from '@/stores/themeStore'

// "Top traded" asset classes, Groww's Equity/Commodities toggle. Every index
// the ticker already streams for Equity, so the dashboard cards can never
// name a symbol/exchange pair the ticker disagrees with.
const TOP_TRADED_TABS = {
  equity: { label: 'Equity', instruments: INDEX_TICKER_SYMBOLS },
  commodities: { label: 'Commodities', instruments: COMMODITY_TICKER_SYMBOLS },
} as const
type TopTradedTab = keyof typeof TOP_TRADED_TABS

interface MarginData {
  availablecash: string
  collateral: string
  m2munrealized: string
  m2mrealized: string
  utiliseddebits: string
}

interface MasterContractStatus {
  status: 'pending' | 'downloading' | 'success' | 'error'
  message?: string
  total_symbols?: number
}

// Get color class based on P&L value
function getPnLColor(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (num > 0) return 'text-profit'
  if (num < 0) return 'text-loss'
  return 'text-foreground'
}

function getPnLBadgeVariant(value: string | number): 'default' | 'destructive' | 'secondary' {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (num > 0) return 'default'
  if (num < 0) return 'destructive'
  return 'secondary'
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const formatCurrency = useMemo(() => makeFormatCurrency(user?.broker), [user?.broker])
  const [marginData, setMarginData] = useState<MarginData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [masterContract, setMasterContract] = useState<MasterContractStatus>({
    status: 'pending',
  })
  const [isAuthenticated, setIsAuthenticated] = useState(true) // Assume authenticated initially
  // Broker token revoked/expired while the app session is still valid
  // (daily token rollover). Routes the user to /broker, not /login (#1400).
  const [brokerExpired, setBrokerExpired] = useState(false)
  const [topTradedTab, setTopTradedTab] = useState<TopTradedTab>('equity')

  // Fetch dashboard funds data
  const fetchFundsData = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/auth/dashboard-data', {
        credentials: 'include',
      })

      if (response.status === 401) {
        const body = await response.json().catch(() => null)
        if (body?.code === 'BROKER_SESSION_EXPIRED') {
          setBrokerExpired(true)
        } else {
          setIsAuthenticated(false)
        }
        setIsLoading(false)
        return
      }

      const data = await response.json()

      if (data.status === 'success' && data.data) {
        setMarginData(data.data)
        setError(null)
      } else {
        setError(data.message || 'Failed to fetch margin data')
      }
    } catch (_err) {
      setError('Failed to fetch margin data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFundsData()
  }, [fetchFundsData])

  // Refresh funds when an order is placed (via SocketIO event)
  useOrderEventRefresh(fetchFundsData, {
    events: ['order_event', 'analyzer_update', 'close_position_event'],
  })

  // Listen for mode changes and refresh data
  useEffect(() => {
    const unsubscribe = onModeChange(() => {
      // Refresh funds data when mode changes
      fetchFundsData()
    })
    return () => unsubscribe()
  }, [fetchFundsData])

  // Check master contract status
  const checkMasterContractStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/master-contract/status', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })

      if (response.status === 401) {
        return
      }

      const data = await response.json()
      setMasterContract(data)
    } catch (_err) {
      setMasterContract({ status: 'error', message: 'Failed to check status' })
    }
  }, [])

  useEffect(() => {
    checkMasterContractStatus()

    // Poll every 5 seconds until successful
    const interval = setInterval(() => {
      setMasterContract((prev) => {
        if (prev.status === 'success') {
          return prev // Don't check again if already successful
        }
        checkMasterContractStatus()
        return prev
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [checkMasterContractStatus])

  // Master Contract LED color
  const getMasterContractLedColor = () => {
    switch (masterContract.status) {
      case 'success':
        return 'bg-profit'
      case 'downloading':
        return 'bg-warning animate-pulse'
      case 'error':
        return 'bg-loss'
      default:
        return 'bg-muted-foreground animate-pulse'
    }
  }

  const getMasterContractStatusText = () => {
    switch (masterContract.status) {
      case 'success':
        return masterContract.total_symbols
          ? `Ready (${masterContract.total_symbols} symbols)`
          : 'Ready'
      case 'downloading':
        return 'Downloading...'
      case 'error':
        return 'Error'
      default:
        return 'Checking...'
    }
  }

  const getMasterContractTextColor = () => {
    switch (masterContract.status) {
      case 'success':
        return 'text-profit'
      case 'downloading':
        return 'text-warning'
      case 'error':
        return 'text-loss'
      default:
        return 'text-muted-foreground'
    }
  }

  // Broker token expired but the app session is fine: send the user to the
  // broker reconnect flow, not /login (which would bounce back) — #1400.
  if (brokerExpired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-2xl font-bold">Broker Session Expired</h1>
        <p className="text-muted-foreground">
          Your broker token has expired (brokers roll tokens daily). Reconnect to continue trading.
        </p>
        <Link
          to="/broker"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reconnect Broker
        </Link>
      </div>
    )
  }

  // If not authenticated, show login prompt
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-2xl font-bold">Session Expired</h1>
        <p className="text-muted-foreground">Please log in to access the dashboard.</p>
        <Link to="/login" className="text-primary hover:underline">
          Go to Login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 md:space-y-12">
      {/* Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">Trading Dashboard</h1>
          <p className="text-muted-foreground mt-1 md:mt-2 text-sm md:text-base">
            Overview of your trading account and market positions
          </p>
        </div>
        {/* Master Contract Status Indicator */}
        <div className="flex items-center gap-2 md:gap-3 bg-muted rounded-lg px-3 md:px-4 py-2 md:py-3 w-fit lg:ml-auto lg:self-start">
          <span className="text-xs md:text-sm font-medium whitespace-nowrap">Master Contract:</span>
          <div className="flex items-center gap-2">
            <div
              className={cn('w-2.5 h-2.5 md:w-3 md:h-3 rounded-full', getMasterContractLedColor())}
            />
            <span
              className={cn('text-xs md:text-sm', getMasterContractTextColor())}
              title={masterContract.message}
            >
              {getMasterContractStatusText()}
            </span>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Main content: candle cards lead (left, widest column), account
          balances follow in a narrow sidebar (right) -- the Groww dashboard's
          "Top traded" + "Positions" split. Stacks on narrow screens, sidebar
          below the cards. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 md:gap-8 items-start">
        {/* Top Traded: the day's candles for every index or commodity the
            selected tab covers. Settings and utility links (Search, Logs,
            Docs, PnL Tracker, OpenVarsity, Latency) moved to /admin, which
            the profile menu already reaches. */}
        <div>
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-semibold">Top Traded</h2>
            <div className="flex gap-2">
              {(Object.keys(TOP_TRADED_TABS) as TopTradedTab[]).map((tab) => (
                <Button
                  key={tab}
                  type="button"
                  size="sm"
                  variant={topTradedTab === tab ? 'default' : 'outline'}
                  className="rounded-full"
                  onClick={() => setTopTradedTab(tab)}
                >
                  {TOP_TRADED_TABS[tab].label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
            {TOP_TRADED_TABS[topTradedTab].instruments.map((item) => (
              <TopInstrumentCard
                key={`${item.exchange}:${item.symbol}`}
                symbol={item.symbol}
                exchange={item.exchange}
                label={item.label ?? item.symbol}
              />
            ))}
          </div>
        </div>

        {/* Account balances sidebar */}
        <Card className="lg:sticky lg:top-20">
          <CardContent className="p-0 divide-y">
            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-xl font-bold text-primary">
                {isLoading
                  ? '...'
                  : marginData
                    ? formatCurrency(Number(marginData.availablecash))
                    : '0.00'}
              </p>
              <Badge variant="secondary" className="mt-1.5">
                Cash Balance
              </Badge>
            </div>

            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">Collateral</p>
              <p className="text-xl font-bold text-chart-4">
                {isLoading
                  ? '...'
                  : marginData
                    ? formatCurrency(Number(marginData.collateral))
                    : '0.00'}
              </p>
              <Badge variant="secondary" className="mt-1.5">
                Total Collateral
              </Badge>
            </div>

            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">Unrealized P&L</p>
              <p
                className={cn(
                  'text-xl font-bold',
                  marginData ? getPnLColor(marginData.m2munrealized) : ''
                )}
              >
                {isLoading
                  ? '...'
                  : marginData
                    ? formatCurrency(Number(marginData.m2munrealized))
                    : '0.00'}
              </p>
              <Badge
                variant={marginData ? getPnLBadgeVariant(marginData.m2munrealized) : 'secondary'}
                className="mt-1.5"
              >
                Mark to Market
              </Badge>
            </div>

            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">Realized P&L</p>
              <p
                className={cn(
                  'text-xl font-bold',
                  marginData ? getPnLColor(marginData.m2mrealized) : ''
                )}
              >
                {isLoading
                  ? '...'
                  : marginData
                    ? formatCurrency(Number(marginData.m2mrealized))
                    : '0.00'}
              </p>
              <Badge
                variant={marginData ? getPnLBadgeVariant(marginData.m2mrealized) : 'secondary'}
                className="mt-1.5"
              >
                Booked P&L
              </Badge>
            </div>

            <div className="px-4 py-3">
              <p className="text-sm text-muted-foreground">Utilised Margin</p>
              <p className="text-xl font-bold text-chart-3">
                {isLoading
                  ? '...'
                  : marginData
                    ? formatCurrency(Number(marginData.utiliseddebits))
                    : '0.00'}
              </p>
              <Badge variant="outline" className="mt-1.5 border-chart-3/50 text-chart-3">
                Used Margin
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
