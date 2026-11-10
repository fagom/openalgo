import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTickerStore } from '@/stores/tickerStore'
import { render, screen, userEvent } from '@/test/test-utils'
import { IndexTicker, MarketTicker, toTickerQuotes } from './MarketTicker'

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
    useTickerStore.setState({ visible: true, indexVisible: true })
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

describe('IndexTicker', () => {
  beforeEach(() => {
    useTickerStore.setState({ visible: true, indexVisible: true })
    useLivePrice.mockReset()
    useLivePrice.mockImplementation((items: Array<{ symbol: string }>) => ({
      data: items.map((i) => ({
        ...i,
        ltp: i.symbol === 'INDIAVIX' ? 13.25 : i.symbol === 'NIFTY' ? 25100 : undefined,
      })),
      multiQuotes: new Map([['NSE_INDEX:INDIAVIX', { prev_close: 14 }]]),
      isConnected: true,
      isPaused: false,
    }))
  })

  it('subscribes to the headline indices, India VIX included, and nothing else', () => {
    render(<IndexTicker />)
    const items = useLivePrice.mock.calls[0][0] as Array<{ symbol: string; exchange: string }>
    expect(items.map((i) => `${i.exchange}:${i.symbol}`)).toEqual(
      expect.arrayContaining(['NSE_INDEX:NIFTY', 'BSE_INDEX:SENSEX', 'NSE_INDEX:INDIAVIX'])
    )
    expect(items.every((i) => i.exchange.endsWith('_INDEX'))).toBe(true)
  })

  it('shows indices by the name a trader uses, with the change from the close', () => {
    render(<IndexTicker />)
    expect(screen.getByRole('region', { name: 'Index ticker' })).toBeInTheDocument()
    expect(screen.getAllByText('INDIA VIX').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NIFTY 50').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/-0\.75 \(-5\.36%\)/).length).toBeGreaterThan(0)
  })

  it('hides on its own, leaving the stock ticker on', async () => {
    const user = userEvent.setup()
    render(<IndexTicker />)
    await user.click(screen.getByRole('button', { name: /Hide index ticker/ }))

    expect(useTickerStore.getState().indexVisible).toBe(false)
    expect(useTickerStore.getState().visible).toBe(true)
    expect(screen.queryByRole('region', { name: 'Index ticker' })).not.toBeInTheDocument()
  })
})
