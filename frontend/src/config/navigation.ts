import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Boxes,
  CandlestickChart,
  ClipboardList,
  Code2,
  Database,
  FileBarChart,
  FileStack,
  FileText,
  FlaskConical,
  Gauge,
  Key,
  Layers,
  LayoutDashboard,
  LineChart,
  type LucideIcon,
  MessageCircle,
  MessageSquare,
  Search,
  Settings,
  Table2,
  TrendingUp,
  User,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Served by Flask (not a React route): render as a full-page link. */
  external?: boolean
  /**
   * Desktop navbar only: below this Tailwind breakpoint the item leaves the
   * bar and is listed under More instead. Items without it always stay.
   */
  collapseBelow?: 'lg' | 'xl'
}

// Main navigation items shown in desktop navbar.
//
// Trimmed to the core trading surfaces only (Groww's pattern: Stocks, F&O,
// Mutual Funds -- a handful of primary tabs, nothing configuration-shaped).
// Platforms, Strategies, Logs and Tools moved to profileMenuItems below.
export const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orderbook', label: 'Orderbook', icon: ClipboardList },
  { href: '/tradebook', label: 'Tradebook', icon: FileText, collapseBelow: 'lg' },
  { href: '/positions', label: 'Positions', icon: TrendingUp },
  { href: '/optionchain', label: 'Option Chain', icon: Table2, collapseBelow: 'lg' },
  { href: '/instrument', label: 'Instrument', icon: LineChart, collapseBelow: 'lg' },
  { href: '/trading', label: 'Trading', icon: CandlestickChart, collapseBelow: 'lg' },
  { href: '/scalping', label: 'Scalping', icon: Zap, collapseBelow: 'lg' },
]

// Items shown in mobile bottom navigation
export const bottomNavItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orderbook', label: 'Orderbook', icon: ClipboardList },
  { href: '/tradebook', label: 'Tradebook', icon: FileText },
  { href: '/positions', label: 'Positions', icon: TrendingUp },
]

// Paths in bottom nav (for filtering mobile sheet items)
const bottomNavPaths = bottomNavItems.map((item) => item.href)

// Secondary items for mobile sheet (items not in bottom nav)
export const mobileSheetItems = navItems.filter((item) => !bottomNavPaths.includes(item.href))

// Profile dropdown menu items
export const profileMenuItems: NavItem[] = [
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/apikey', label: 'API Key', icon: Key },
  // Action Center stays immediately after API Key. It was moved here out of the
  // main navbar on that understanding and a test pins the adjacency, so a new
  // entry goes after it rather than between the two.
  { href: '/action-center', label: 'Action Center', icon: Bell },
  // Agent Config is NOT here. It lives under /admin with the other
  // configuration surfaces. The chat header carries its own settings control,
  // so a configured /agent still has a route back to its settings without this
  // menu holding one.
  { href: '/agent', label: 'Agent', icon: Bot },
  // Platforms, Strategies, Logs and Tools: moved out of the top navbar (they
  // read as configuration/secondary surfaces, not core trading tabs).
  { href: '/platforms', label: 'Platforms', icon: Layers },
  { href: '/strategy', label: 'Strategies', icon: Boxes },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/logs', label: 'Logs', icon: FileBarChart },
  { href: '/master-contract', label: 'Master Contract', icon: FileStack },
  { href: '/telegram', label: 'Telegram Bot', icon: MessageSquare },
  { href: '/whatsapp', label: 'WhatsApp Bot', icon: MessageCircle },
  { href: '/holdings', label: 'Holdings', icon: ClipboardList },
  { href: '/flow', label: 'Flow Editor', icon: Workflow },
  { href: '/python', label: 'Python Strategies', icon: Code2 },
  { href: '/pnl-tracker', label: 'PnL Tracker', icon: BarChart3 },
  { href: '/eod-reports', label: 'Daily Reports', icon: FileBarChart },
  { href: '/historify', label: 'Historify', icon: Database },
  { href: '/search/token', label: 'Search', icon: Search },
  { href: '/sandbox', label: 'Sandbox', icon: FlaskConical },
  { href: '/leverage', label: 'Leverage', icon: Gauge },
  { href: '/admin', label: 'Admin', icon: Settings },
]

// External links
export const externalLinks = {
  docs: { href: 'https://docs.openalgo.in', label: 'Docs', icon: BookOpen },
}

// Shared utility to check if a route is active.
// Every nav item is a leaf route, so an exact match is all that is needed.
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href
}
