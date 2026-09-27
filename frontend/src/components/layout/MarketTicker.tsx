import { X } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TICKER_SYMBOLS, type TickerSymbol } from '@/config/tickerSymbols'
import { useLivePrice } from '@/hooks/useLivePrice'
import { useMarketStatus } from '@/hooks/useMarketStatus'
import { cn } from '@/lib/utils'
import { useTickerStore } from '@/stores/tickerStore'

/** Scroll speed in px/s: about a TV channel's pace, readable in passing. */
const SPEED_PX_PER_SEC = 70
/** Items mounted at once. Enough to cover a 4K-wide strip; the rest wait their turn. */
const WINDOW = 36
/** Prices repaint at most this often. A ticker is read in passing, not traded from. */
const REPAINT_MS = 1000

const priceFormat = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export interface TickerQuote extends TickerSymbol {
  ltp: number
  /** Absolute change from the previous close; null when the close is unknown. */
  change: number | null
  changePercent: number | null
}

/**
 * Join live prices to previous closes. A symbol with no price yet is left out
 * rather than shown as a dash, so a symbol the broker does not know never takes
 * a slot on the strip.
 */
export function toTickerQuotes(
  symbols: readonly TickerSymbol[],
  ltps: ReadonlyArray<{ ltp?: number }>,
  prevCloses: ReadonlyMap<string, number | undefined>
): TickerQuote[] {
  const out: TickerQuote[] = []
  symbols.forEach((s, i) => {
    const ltp = ltps[i]?.ltp
    if (ltp === undefined || !Number.isFinite(ltp) || ltp <= 0) return
    const prev = prevCloses.get(`${s.exchange}:${s.symbol}`)
    const hasPrev = prev !== undefined && Number.isFinite(prev) && prev > 0
    out.push({
      ...s,
      ltp,
      change: hasPrev ? ltp - prev : null,
      changePercent: hasPrev ? ((ltp - prev) / prev) * 100 : null,
    })
  })
  return out
}

const TickerItem = memo(
  function TickerItem({ q }: { q: TickerQuote }) {
    const up = q.change !== null && q.change > 0
    const down = q.change !== null && q.change < 0
    return (
      <span className="inline-flex shrink-0 items-baseline gap-2 px-4">
        <span className="font-semibold text-foreground">{q.label ?? q.symbol}</span>
        <span className="tabular-nums text-foreground">{priceFormat.format(q.ltp)}</span>
        {q.change !== null && q.changePercent !== null && (
          <span
            className={cn(
              'tabular-nums',
              up && 'text-profit',
              down && 'text-loss',
              !up && !down && 'text-muted-foreground'
            )}
          >
            {up ? '+' : ''}
            {priceFormat.format(q.change)} ({up ? '+' : ''}
            {q.changePercent.toFixed(2)}%)
          </span>
        )}
        <span aria-hidden className="text-border">
          |
        </span>
      </span>
    )
  },
  // A fresh quote object arrives every repaint; only a changed number repaints.
  (a, b) =>
    a.q.symbol === b.q.symbol &&
    a.q.ltp === b.q.ltp &&
    a.q.change === b.q.change &&
    a.q.label === b.q.label
)

/**
 * The latest value, published at most once per `ms`. Five hundred live symbols
 * can tick hundreds of times a second; re-rendering the strip on each would
 * spend the main thread the charts need.
 */
function useThrottled<T>(value: T, ms: number): T {
  const latest = useRef(value)
  latest.current = value
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const id = setInterval(() => setShown(latest.current), ms)
    return () => clearInterval(id)
  }, [ms])
  return shown
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * A virtualized marquee. Only WINDOW items are mounted; the track is moved by a
 * transform written straight to the DOM each frame, and when the leading item
 * has scrolled fully out it is dropped and the next symbol joins at the tail.
 * So the cost is the same for 50 symbols or 500, and nothing re-renders per
 * frame. A CSS animation over the whole list would mount every item twice in a
 * track tens of thousands of pixels wide.
 */
function TickerScroller({ quotes }: { quotes: TickerQuote[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const offset = useRef(0)
  const pendingShift = useRef(0)
  const paused = useRef(false)
  // Monotonic, so an item keeps its React key (its absolute position) while it
  // travels across the strip; only the one leaving and the one arriving change.
  const [start, setStart] = useState(0)
  const [reduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      // Clamped so a tab returning from the background does not leap.
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const track = trackRef.current
      if (track && !paused.current && pendingShift.current === 0) {
        offset.current -= SPEED_PX_PER_SEC * dt
        const lead = track.firstElementChild as HTMLElement | null
        const width = lead?.getBoundingClientRect().width ?? 0
        if (width > 0 && -offset.current >= width) {
          // Applied in the layout effect below, in the same commit that
          // removes the item, so the strip never visibly jumps.
          pendingShift.current = width
          setStart((s) => s + 1)
        }
        track.style.transform = `translate3d(${offset.current}px, 0, 0)`
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  // biome-ignore lint/correctness/useExhaustiveDependencies: start is the trigger -- the shift belongs to the commit that dropped the lead item
  useLayoutEffect(() => {
    if (pendingShift.current === 0) return
    offset.current += pendingShift.current
    pendingShift.current = 0
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${offset.current}px, 0, 0)`
    }
  }, [start])

  const n = quotes.length
  // Under reduced motion nothing moves, so everything is mounted for manual
  // scrolling. Otherwise a fixed window, which repeats a short list as needed.
  const count = reduced ? n : WINDOW
  const visible = Array.from({ length: n === 0 ? 0 : count }, (_, i) => ({
    pos: start + i,
    q: quotes[(start + i) % n],
  }))

  return (
    <div
      className="ticker-viewport relative h-full min-w-0 flex-1 overflow-hidden"
      onMouseEnter={() => {
        paused.current = true
      }}
      onMouseLeave={() => {
        paused.current = false
      }}
      // Touch has no hover: holding a finger on the strip pauses it instead.
      onTouchStart={() => {
        paused.current = true
      }}
      onTouchEnd={() => {
        paused.current = false
      }}
      onTouchCancel={() => {
        paused.current = false
      }}
      onFocus={() => {
        paused.current = true
      }}
      onBlur={() => {
        paused.current = false
      }}
    >
      <div ref={trackRef} className="flex h-full w-max items-center will-change-transform">
        {visible.map(({ pos, q }) => (
          <TickerItem key={pos} q={q} />
        ))}
      </div>
    </div>
  )
}

function MarketTickerStrip({ className }: { className?: string }) {
  const setVisible = useTickerStore((s) => s.setVisible)
  // Stable identity: useLivePrice re-subscribes whenever the array changes.
  const items = useMemo<Array<TickerSymbol & { ltp?: number }>>(
    () => TICKER_SYMBOLS.map((s) => ({ ...s })),
    []
  )
  const { data, multiQuotes, isConnected, isPaused } = useLivePrice(items, {
    // The ticker is ambient: a minute-old close is fine between WS ticks, and
    // polling 500 quotes every 30s would be wasted work on every page.
    multiQuotesRefreshInterval: 60_000,
  })

  // Every symbol here trades on NSE hours. useLivePrice's own flag counts any
  // exchange, and 24/7 crypto kept it reading Live through a Sunday.
  const { isMarketOpen } = useMarketStatus()
  const isLive = isConnected && !isPaused && isMarketOpen('NSE')

  const shownData = useThrottled(data, REPAINT_MS)
  const quotes = useMemo(() => {
    const prev = new Map<string, number | undefined>()
    for (const [key, q] of multiQuotes) prev.set(key, q.prev_close)
    return toTickerQuotes(TICKER_SYMBOLS, shownData, prev)
  }, [shownData, multiQuotes])

  return (
    <section
      aria-label="Market ticker"
      className={cn(
        'flex h-8 shrink-0 items-center border-t bg-background/95 text-xs backdrop-blur supports-[backdrop-filter]:bg-background/85',
        className
      )}
    >
      <div className="flex h-full shrink-0 items-center gap-1.5 border-r px-3 font-semibold tracking-wide text-muted-foreground uppercase">
        <span
          className={cn(
            'size-1.5 rounded-full',
            isLive ? 'bg-success animate-pulse' : 'bg-muted-foreground/60'
          )}
        />
        {isLive ? 'Live' : 'Closed'}
      </div>

      {quotes.length === 0 ? (
        <span className="flex h-full min-w-0 flex-1 items-center px-4 text-muted-foreground">
          Loading prices...
        </span>
      ) : (
        <TickerScroller quotes={quotes} />
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        className="mx-1 size-7"
        tooltip="Hide ticker. Turn it back on under Profile, Theme."
        tooltipSide="top"
        onClick={() => setVisible(false)}
      >
        <X className="size-4" />
      </Button>
    </section>
  )
}

/**
 * The scrolling market strip along the bottom of every page. On a phone it sits
 * directly above the bottom navigation (see Layout). Renders nothing, and subscribes to
 * nothing, while the trader has it switched off.
 */
export function MarketTicker({ className }: { className?: string }) {
  const visible = useTickerStore((s) => s.visible)
  if (!visible) return null
  return <MarketTickerStrip className={className} />
}
