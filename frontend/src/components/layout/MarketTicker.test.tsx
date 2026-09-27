import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTickerStore } from '@/stores/tickerStore'
import { render, screen, userEvent } from '@/test/test-utils'
import { MarketTicker, toTickerQuotes } from './MarketTicker'

const useLivePrice = vi.fn()
vi.mock('@/hooks/useLivePrice', () => ({
  useLivePrice: (...args: unknown[]) => useLivePrice(...args),
}))
const nseOpen = vi.fn(() => true)
vi.mock('@/hooks/useMarketStatus', () => ({
  useMarketStatus: () => ({ isMarketOpen: (ex: string) => ex === 'NSE' && nseOpen() }),
}))

const NIFTY = { symbol: 'NIFTY', exchange: 'NSE_INDEX', label: 'NIFTY 50' }
const INFY = { symbol: 'INFY', exchange: 'NSE' }

describe('toTickerQuotes', () => {
  it('computes change from the previous close', () => {
    const [q] = toTickerQuotes([INFY], [{ ltp: 1650 }], new Map([['NSE:INFY', 1600]]))
    expect(q.change).toBeCloseTo(50)
    expect(q.changePercent).toBeCloseTo(3.125)
  })

  it('leaves out a symbol with no price, so an unknown one never takes a slot', () => {
    const quotes = toTickerQuotes([NIFTY, INFY], [{}, { ltp: 1650 }], new Map())
    expect(quotes.map((q) => q.symbol)).toEqual(['INFY'])
  })

  it('shows the price without a change when the close is unknown', () => {
    const [q] = toTickerQuotes([INFY], [{ ltp: 1650 }], new Map([['NSE:INFY', 0]]))
    expect(q.change).toBeNull()
    expect(q.changePercent).toBeNull()
  })
})

describe('MarketTicker', () => {
  beforeEach(() => {
    useTickerStore.setState({ visible: true })
    useLivePrice.mockReset()
    useLivePrice.mockImplementation((items: Array<{ symbol: string }>) => ({
      data: items.map((i) => ({ ...i, ltp: i.symbol === 'RELIANCE' ? 2940.5 : undefined })),
      multiQuotes: new Map([['NSE:RELIANCE', { prev_close: 2900.5 }]]),
      isConnected: true,
      isPaused: false,
    }))
  })

  it('scrolls a stock with a signed change from the previous close', () => {
    render(<MarketTicker />)
    expect(screen.getAllByText('RELIANCE').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\+40\.00 \(\+1\.38%\)/).length).toBeGreaterThan(0)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('mounts a fixed window, not all 500 companies', () => {
    useLivePrice.mockImplementation((items: Array<{ symbol: string }>) => ({
      data: items.map((i) => ({ ...i, ltp: 100 })),
      multiQuotes: new Map(),
      isConnected: true,
      isPaused: false,
    }))
    render(<MarketTicker />)
    const region = screen.getByRole('region', { name: 'Market ticker' })
    const mounted = region.querySelectorAll('.tabular-nums').length
    expect(useLivePrice.mock.calls[0][0]).toHaveLength(500)
    expect(mounted).toBeGreaterThan(0)
    expect(mounted).toBeLessThanOrEqual(36)
  })

  it('reads Closed outside NSE hours, even with the feed connected', () => {
    nseOpen.mockReturnValueOnce(false)
    render(<MarketTicker />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('hides, and stops subscribing, when switched off', async () => {
    const user = userEvent.setup()
    render(<MarketTicker />)
    await user.click(screen.getByRole('button', { name: /Hide ticker/ }))

    expect(useTickerStore.getState().visible).toBe(false)
    expect(screen.queryByRole('region', { name: 'Market ticker' })).not.toBeInTheDocument()
    const calls = useLivePrice.mock.calls.length
    render(<MarketTicker />)
    expect(useLivePrice.mock.calls.length).toBe(calls)
  })
})
