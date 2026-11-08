export interface MiniBar {
  open: number
  high: number
  low: number
  close: number
}

interface MiniCandlesProps {
  bars: MiniBar[]
  className?: string
  /** Rendered height in SVG user units (viewBox is unitless, scales to fit). */
  height?: number
}

const VIEW_WIDTH = 240
const GAP_FRACTION = 0.6

/**
 * Real floating candlesticks (body + wick), not a bar chart pinned to zero --
 * the Groww "Top traded" card chart this is modelled on positions each
 * candle at its actual price level within the visible high/low range, which
 * is what makes a flat afternoon look flat instead of every bar reaching the
 * same baseline. Renders as one small SVG so the wick can be a crisp 1px
 * line; a handful of div bars could not do that cleanly.
 */
export function MiniCandles({ bars, className, height = 64 }: MiniCandlesProps) {
  if (bars.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-foreground ${className ?? ''}`}
        style={{ height }}
      >
        No data
      </div>
    )
  }

  const highs = bars.map((b) => b.high)
  const lows = bars.map((b) => b.low)
  const max = Math.max(...highs)
  const min = Math.min(...lows)
  const range = max - min || 1

  const slot = VIEW_WIDTH / bars.length
  const bodyWidth = slot * (1 - GAP_FRACTION)

  // SVG y grows downward, so a higher price maps to a smaller y.
  const y = (price: number) => height - ((price - min) / range) * height

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Intraday candlestick chart"
    >
      {bars.map((bar, i) => {
        const up = bar.close >= bar.open
        const cx = i * slot + slot / 2
        const bodyTop = y(Math.max(bar.open, bar.close))
        const bodyBottom = y(Math.min(bar.open, bar.close))
        // A doji (open == close) would otherwise draw a zero-height, invisible
        // body -- give every candle at least a visible sliver.
        const bodyHeight = Math.max(bodyBottom - bodyTop, 1.5)
        const colorClass = up ? 'fill-profit stroke-profit' : 'fill-loss stroke-loss'
        return (
          <g key={`${bar.open}-${bar.high}-${bar.low}-${bar.close}-${i}`} className={colorClass}>
            <line x1={cx} y1={y(bar.high)} x2={cx} y2={y(bar.low)} strokeWidth={1} />
            <rect
              x={cx - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              stroke="none"
            />
          </g>
        )
      })}
    </svg>
  )
}
