import { Navigate, Outlet, useLocation } from 'react-router'
import { SocketProvider } from '@/components/socket/SocketProvider'
import { isPreBrokerPath } from '@/lib/brokerProfiles'
import { useAuthStore } from '@/stores/authStore'
import { Footer } from './Footer'
import { MarketTicker } from './MarketTicker'
import { MobileBottomNav } from './MobileBottomNav'
import { Navbar } from './Navbar'

export function Layout() {
  const { isAuthenticated, user } = useAuthStore()
  const { pathname } = useLocation()

  // AuthSync has already synced Flask session with Zustand store
  // So we just need to check the Zustand store state
  // A trader signed in with their password but not yet connected to a broker
  // (isAuthenticated is only true once a broker is connected) can open
  // Profile, to add the broker keys.
  const preBroker = Boolean(user?.username) && isPreBrokerPath(pathname)

  if (!isAuthenticated && !preBroker) {
    return <Navigate to="/login" replace />
  }

  // If logged in but no broker selected, redirect to broker selection.
  if (!user?.broker && !preBroker) {
    return <Navigate to="/broker" replace />
  }

  return (
    <SocketProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="container mx-auto px-4 sm:px-6 py-8 pb-32 md:pb-10 flex-1">
          <Outlet />
        </main>
        <Footer className="hidden md:block" />
        {/* Desktop: sticks to the bottom of the window while the page scrolls,
            like a TV news strip, and settles below the footer at the end.
            Phone: pinned directly above the fixed bottom navigation (h-16 plus
            the home-indicator inset), which is why main pads 8rem there. */}
        <MarketTicker className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-40 md:sticky md:inset-x-auto md:bottom-0" />
        <MobileBottomNav />
      </div>
    </SocketProvider>
  )
}

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  )
}
