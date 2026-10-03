import { BarChart3, BookOpen, LogOut, Menu, Moon, Sun, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { authApi } from '@/api/auth'
import { LogoutConfirmDialog } from '@/components/auth/LogoutConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { isActiveRoute, mobileSheetItems, navItems } from '@/config/navigation'
import { useProfileMenuItems } from '@/hooks/useProfileMenuItems'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { showToast } from '@/utils/toast'
import { IndexTicker } from './MarketTicker'

interface NavbarProps {
  /**
   * Span the full viewport instead of the centred, width-capped container.
   *
   * Pages rendered inside Layout share its `container mx-auto`, so the nav
   * lines up with the content below it and this stays false. Full-bleed pages
   * under FullWidthLayout render this navbar themselves and have no such
   * container, so a capped nav floats inset above edge-to-edge content -- on a
   * 1920px screen Tailwind caps `container` at 1536px, leaving ~192px of gutter
   * each side while the page fills the width.
   */
  fluid?: boolean
}

export function Navbar({ fluid = false }: NavbarProps = {}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  const { mode, appMode, toggleMode, toggleAppMode, isTogglingMode } = useThemeStore()
  const { user, logout } = useAuthStore()

  // Profile menu filtered by broker capabilities (shared hook, issue #1480)
  const filteredProfileMenuItems = useProfileMenuItems()

  const handleLogout = async () => {
    try {
      await authApi.logout()
      logout()
      navigate('/login')
      showToast.success('Logged out successfully')
    } catch {
      logout()
      navigate('/login')
    }
  }

  const handleModeToggle = async () => {
    const result = await toggleAppMode()
    if (result.success) {
      const newMode = useThemeStore.getState().appMode
      showToast.success(`Switched to ${newMode === 'live' ? 'Live' : 'Analyze'} mode`)

      // Show warning toast when enabling analyzer mode (like old UI)
      if (newMode === 'analyzer') {
        setTimeout(() => {
          showToast.warning('Analyzer (Sandbox) mode is for testing purposes only', undefined, {
            duration: 10000,
          })
        }, 2000)
      }
    } else {
      showToast.error(result.message || 'Failed to toggle mode')
    }
  }

  const isActive = (href: string) => isActiveRoute(location.pathname, href)

  return (
    <nav
      className={cn(
        'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        // Analyzer mode carries a violet rule along the top so it can never be
        // mistaken for live, even on a page with little chrome.
        appMode === 'analyzer' && 'border-t-2 border-t-primary'
      )}
    >
      <div
        data-testid="navbar-row"
        className={cn('px-4 flex h-14 items-center', fluid ? 'w-full' : 'container mx-auto')}
      >
        {/* Mobile Menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 min-h-[44px] min-w-[44px]"
              aria-label="Toggle menu"
            >
              <Menu className="size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto">
            {/* Visually hidden but accessible for screen readers */}
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
              <SheetDescription>Main navigation and quick access links</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 py-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 px-2"
                onClick={() => setMobileOpen(false)}
              >
                <img src="/logo.png" alt="OpenAlgo" className="h-8 w-8" />
                <span className="font-heading text-lg font-bold tracking-tight">OpenAlgo</span>
              </Link>

              {/* Secondary nav items (not in bottom nav) */}
              <nav className="flex flex-col gap-1">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Navigation
                </div>
                {mobileSheetItems.map((item) => {
                  const active = isActive(item.href)
                  const cls = cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors min-h-[44px] touch-manipulation',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'hover:bg-muted active:bg-muted'
                  )
                  const inner = (
                    <>
                      <item.icon className="size-5" />
                      {item.label}
                    </>
                  )
                  return item.external ? (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cls}
                      aria-current={active ? 'page' : undefined}
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cls}
                      aria-current={active ? 'page' : undefined}
                    >
                      {inner}
                    </Link>
                  )
                })}
              </nav>

              {/* Profile menu items for mobile access */}
              <nav className="flex flex-col gap-1 border-t pt-4">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Quick Access
                </div>
                {filteredProfileMenuItems.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors min-h-[44px] touch-manipulation',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted active:bg-muted'
                      )}
                      aria-current={active ? 'page' : undefined}
                    >
                      <item.icon className="size-5" />
                      {item.label}
                    </Link>
                  )
                })}
                <a
                  href="https://docs.openalgo.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors min-h-[44px] touch-manipulation hover:bg-muted active:bg-muted"
                  onClick={() => setMobileOpen(false)}
                >
                  <BookOpen className="size-5" />
                  Docs
                </a>
              </nav>
            </div>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-2.5 mr-8">
          <img src="/logo.png" alt="OpenAlgo" className="h-8 w-8" />
          <span className="hidden font-heading text-lg font-bold tracking-tight sm:inline-block">
            OpenAlgo
          </span>
        </Link>

        {/* Desktop Navigation.
            Icon-only between md and xl so all 9 items fit portrait monitors
            and small laptops (768-1280px wide) without squashing or pushing
            the profile menu off-screen; full labels from xl up (issue #1384).

            From xl the labels appear but the bar does not grow to match: inside
            Layout it shares the page `container`, which Tailwind caps at 1280px
            for every viewport from 1280px to 1535px. Nine labelled items are
            986px and the logo plus the right-hand controls take 394px, so the
            row needed 1412px and had 1248px (issue #1507). Below 2xl the items
            therefore use px-1.5 with tighter gaps, and the right-hand controls
            keep their tighter gap and the short mode wording already used below
            lg (203px instead of 255px). The padding is deliberately tighter
            than it needs to be on the fonts we develop against: this row is
            laid out with fixed spacing but rendered in whatever the OS resolves
            for `system-ui`, and the widest common face (DejaVu Sans, a Linux
            default) runs ~7% wider than macOS. px-2 left only 2px of slack
            there; px-1.5 leaves ~38px. At 2xl and above nothing changes, and
            e2e/navbar-fit.spec.ts asserts the row never overflows. */}
        <nav className="hidden md:flex items-center gap-0.5 2xl:gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href)
            // Dropbox-style: active item is blue text with a blue rule at the
            // bottom edge of the bar, not a filled pill.
            const className = cn(
              'flex items-center gap-1.5 2xl:gap-2 rounded-md px-1.5 2xl:px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )
            const content = (
              <>
                <item.icon className="size-5 shrink-0" />
                <span className="hidden xl:inline">{item.label}</span>
              </>
            )
            // Flask-served pages (e.g. /trading) need a full page load,
            // not client-side routing.
            const link = item.external ? (
              <a
                href={item.href}
                aria-label={item.label}
                className={className}
                aria-current={active ? 'page' : undefined}
              >
                {content}
              </a>
            ) : (
              <Link
                to={item.href}
                aria-label={item.label}
                className={className}
                aria-current={active ? 'page' : undefined}
              >
                {content}
              </Link>
            )
            // Labels are hidden below xl, so the tooltip is what names the icon.
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="bottom" className="xl:hidden">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>

        {/* Right Side */}
        <div className="ml-auto flex items-center gap-1 2xl:gap-2">
          {/* Broker Badge — hidden below lg to keep the bar within narrow
              (portrait/small-laptop) widths */}
          {user?.broker && (
            <Badge variant="muted" className="hidden lg:flex text-xs capitalize">
              {user.broker}
            </Badge>
          )}

          {/* Mode Badge */}
          <Badge variant={appMode === 'live' ? 'success' : 'default'} className="text-xs">
            <span className="hidden 2xl:inline">
              {appMode === 'live' ? 'Live Mode' : 'Analyze Mode'}
            </span>
            <span className="2xl:hidden">{appMode === 'live' ? 'Live' : 'Analyze'}</span>
          </Badge>

          {/* Mode Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleModeToggle}
            disabled={isTogglingMode}
            tooltip={`Switch to ${appMode === 'live' ? 'Analyze' : 'Live'} mode`}
            tooltipSide="bottom"
          >
            {isTogglingMode ? (
              <div className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : appMode === 'live' ? (
              <Zap />
            ) : (
              <BarChart3 />
            )}
          </Button>

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMode}
            disabled={appMode !== 'live'}
            tooltip={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            tooltipSide="bottom"
          >
            {mode === 'light' ? <Sun /> : <Moon />}
          </Button>

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground"
                tooltip="Account menu"
                tooltipSide="bottom"
                aria-label="Open user menu"
              >
                <span className="text-sm font-medium">
                  {user?.username?.[0]?.toUpperCase() || 'O'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {filteredProfileMenuItems.map((item) =>
                item.external ? (
                  <DropdownMenuItem key={item.href} asChild className="cursor-pointer">
                    <a href={item.href} className="flex items-center">
                      <item.icon className="size-[18px] mr-2" />
                      {item.label}
                    </a>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    key={item.href}
                    onSelect={() => navigate(item.href)}
                    className="cursor-pointer"
                  >
                    <item.icon className="size-[18px] mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                )
              )}
              <DropdownMenuItem asChild>
                <a
                  href="https://docs.openalgo.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <BookOpen className="size-5" />
                  Docs
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowLogoutDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="size-[18px] mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* A second row inside the sticky nav, so the indices stay in view while
          the page scrolls, on desktop and phone alike. */}
      <IndexTicker />

      <LogoutConfirmDialog
        open={showLogoutDialog}
        onOpenChange={setShowLogoutDialog}
        onConfirm={handleLogout}
      />
    </nav>
  )
}
