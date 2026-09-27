/**
 * The tool registry, shared by the /tools page and the home page.
 *
 * Lives here rather than inside the page so the home page can state how many
 * tools exist without importing the page component -- and so the number is
 * derived rather than typed. A hardcoded count goes stale the moment a tool is
 * added, which is exactly how the previous "15+" survived three new tools.
 */
export interface Tool {
  title: string
  description: string
  href: string
  color: string
}

export const tools: Tool[] = [
  {
    title: 'Strategy Builder',
    description:
      'Build multi-leg option strategies with live Greeks, payoff diagram and what-if simulators',
    href: '/strategybuilder',
    color: 'bg-chart-4',
  },
  {
    title: 'Strategy Portfolio',
    description: 'Saved strategies across MyTrades and Simulation watchlists',
    href: '/strategybuilder/portfolio',
    color: 'bg-chart-4',
  },
  {
    title: 'Portfolio Backtester',
    description:
      'Backtest a weighted portfolio against an index with real delivery costs, rebalancing rules, crisis periods and a full tearsheet',
    href: '/portfolio-backtester',
    color: 'bg-profit',
  },
  {
    title: 'SIP Backtester',
    description:
      'What a monthly, weekly or quarterly SIP would actually have returned: XIRR, rupee-cost averaging, start-date sensitivity and how it compares with a lumpsum',
    href: '/sip-backtester',
    color: 'bg-profit',
  },
  {
    title: 'Portfolio Analyzer',
    description:
      'Grade the holdings you actually own: concentration, co-movement, drawdown resilience and behaviour in past crises',
    href: '/portfolio-analyzer',
    color: 'bg-info',
  },
  {
    title: 'Option Chain',
    description: 'Real-time option chain with live Greeks, OI data, and quick order placement',
    href: '/optionchain',
    color: 'bg-success',
  },
  {
    title: 'Option Greeks',
    description: 'Historical IV, Delta, Theta, Vega, and Gamma charts for ATM options',
    href: '/ivchart',
    color: 'bg-chart-4',
  },
  {
    title: 'OI Tracker',
    description: 'Open Interest analysis with CE/PE OI bars, PCR overlay, and ATM strike marker',
    href: '/oitracker',
    color: 'bg-primary',
  },
  {
    title: 'OI Range',
    description:
      'Open Interest by strike for a custom range with ATM-relative quick selectors and optional 1-minute auto-refresh',
    href: '/oirange',
    color: 'bg-info',
  },
  {
    title: 'Max Pain',
    description: 'Max Pain strike calculation with visual pain distribution across strikes',
    href: '/maxpain',
    color: 'bg-warning',
  },
  {
    title: 'Straddle Chart',
    description:
      'Dynamic ATM Straddle chart with rolling strike, Spot, and Synthetic Futures overlay',
    href: '/straddle',
    color: 'bg-chart-3',
  },
  {
    title: 'Straddle PnL',
    description:
      'Simulated intraday ATM straddle P&L with automated N-point adjustments and trade log',
    href: '/straddlepnl',
    color: 'bg-warning',
  },
  {
    title: 'Vol Surface',
    description:
      '3D Implied Volatility surface across strikes and expiries using live option chain data',
    href: '/volsurface',
    color: 'bg-destructive',
  },
  {
    title: 'GEX Dashboard',
    description: 'Gamma Exposure analysis with OI Walls, Net GEX per strike, and top gamma strikes',
    href: '/gex',
    color: 'bg-info',
  },
  {
    title: 'Gamma Density',
    description:
      'Γ×OI density and convexity zones with intraday & to-expiry views, ATM IV, and ±1σ/±2σ expected-move bands',
    href: '/gammadensity',
    color: 'bg-success',
  },
  {
    title: 'IV Smile',
    description: 'Implied Volatility smile with Call/Put IV curves, ATM IV, and skew analysis',
    href: '/ivsmile',
    color: 'bg-chart-3',
  },
  {
    title: 'OI Profile',
    description: 'Futures candlestick with OI butterfly and daily OI change across strikes',
    href: '/oiprofile',
    color: 'bg-warning',
  },
  {
    title: 'Arbitrage',
    description:
      'Realtime futures calendar-spread scanner across NFO & MCX, ranked by executable bid/ask spread % with one-click two-leg orders',
    href: '/arbitrage',
    color: 'bg-buy',
  },
]
