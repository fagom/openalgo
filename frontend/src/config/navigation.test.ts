import { describe, expect, it } from 'vitest'
import {
  bottomNavItems,
  isActiveRoute,
  mobileSheetItems,
  navItems,
  profileMenuItems,
} from './navigation'

describe('Navigation Config', () => {
  describe('navItems', () => {
    it('contains only the core trading tabs', () => {
      // Trimmed to Groww's pattern: a handful of primary tabs, nothing
      // configuration-shaped. Platforms, Strategies, Logs and Tools moved to
      // profileMenuItems. Instrument (chain + price action + IV in one view)
      // sits between Positions and Trading.
      expect(navItems).toHaveLength(6)

      const labels = navItems.map((item) => item.label)
      expect(labels).toEqual([
        'Dashboard',
        'Orderbook',
        'Tradebook',
        'Positions',
        'Instrument',
        'Trading',
      ])
    })

    it('all items have required properties', () => {
      navItems.forEach((item) => {
        expect(item).toHaveProperty('href')
        expect(item).toHaveProperty('label')
        expect(item).toHaveProperty('icon')
        expect(item.href).toMatch(/^\//)
        expect(item.label.length).toBeGreaterThan(0)
      })
    })
  })

  describe('bottomNavItems', () => {
    it('contains exactly 4 items for mobile bottom nav', () => {
      expect(bottomNavItems).toHaveLength(4)
    })

    it('has the correct order: Dashboard, Orderbook, Tradebook, Positions', () => {
      const labels = bottomNavItems.map((item) => item.label)
      expect(labels).toEqual(['Dashboard', 'Orderbook', 'Tradebook', 'Positions'])
    })
  })

  describe('mobileSheetItems', () => {
    it('excludes items already in bottomNavItems', () => {
      const bottomPaths = bottomNavItems.map((item) => item.href)
      const sheetPaths = mobileSheetItems.map((item) => item.href)

      sheetPaths.forEach((path) => {
        expect(bottomPaths).not.toContain(path)
      })
    })

    it('contains the remaining nav items (Instrument, Trading)', () => {
      // Dashboard, Orderbook, Tradebook, Positions are already in
      // bottomNavItems; Platforms/Strategies/Logs/Tools now live in the
      // profile menu, not navItems, so Instrument and Trading are what's
      // left over.
      const sheetLabels = mobileSheetItems.map((item) => item.label)
      expect(sheetLabels).toEqual(['Instrument', 'Trading'])
    })
  })

  describe('profileMenuItems', () => {
    it('contains profile-related menu items', () => {
      const labels = profileMenuItems.map((item) => item.label)
      expect(labels).toContain('Profile')
      expect(labels).toContain('API Key')
      expect(labels).toContain('Holdings')
      // Action Center moved from the main navbar into the profile dropdown,
      // positioned right after API Key.
      expect(labels).toContain('Action Center')
      expect(labels.indexOf('Action Center')).toBe(labels.indexOf('API Key') + 1)
    })

    it('holds the surfaces trimmed out of navItems', () => {
      const labels = profileMenuItems.map((item) => item.label)
      expect(labels).toEqual(expect.arrayContaining(['Platforms', 'Strategies', 'Tools', 'Logs']))
    })
  })

  describe('isActiveRoute', () => {
    it('returns true for exact matches', () => {
      expect(isActiveRoute('/dashboard', '/dashboard')).toBe(true)
      expect(isActiveRoute('/orderbook', '/orderbook')).toBe(true)
      expect(isActiveRoute('/positions', '/positions')).toBe(true)
    })

    it('returns false for non-matching routes', () => {
      expect(isActiveRoute('/dashboard', '/orderbook')).toBe(false)
      expect(isActiveRoute('/positions', '/holdings')).toBe(false)
    })

    it('does not prefix match', () => {
      // No nav item owns nested pages, so neither a child path nor a longer
      // name that merely starts with the href may light the tab up.
      expect(isActiveRoute('/dashboard/sub', '/dashboard')).toBe(false)
      expect(isActiveRoute('/orderbookextra', '/orderbook')).toBe(false)
    })
  })
})
