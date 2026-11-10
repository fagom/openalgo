import { Link2 } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'
import { useIntradayCandles } from '@/hooks/useIntradayCandles'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { useResolvedSymbol } from '@/hooks/useResolvedSymbol'
import { chartHref } from '@/lib/trading/chartLink'
import { cn } from '@/lib/utils'
import { MiniCandles } from './MiniCandles'

interface TopInstrumentCardProps {
  symbol: string
  exchange: string
  label: string
}

/**
 * One "Top traded" card: label, the day's candles directly beneath it, LTP
 * and change below that, and a corner link into the full chart terminal.
 * The Groww-style dashboard tile this redesign is modelled on.
 *
 * `symbol`/`exchange` as given by the caller (an index, or a bare commodity
 * name with no expiry) are resolved to the actual quotable instrument before
 * anything is fetched -- see useResolvedSymbol for why a bare MCX name needs
 * that extra step and an index does not.
 */
export function TopInstrumentCard({ symbol, exchange, label }: TopInstrumentCardProps) {
  const resolved = useResolvedSymbol(symbol, exchange)
  const { data } = useLiveQuote(resolved?.symbol ?? '', resolved?.exchange ?? '', {
    mode: 'Quote',
    enabled: resolved !== null,
  })
  const bars = useIntradayCandles(resolved?.symbol ?? '', resolved?.exchange ?? '')

  const change = data.change ?? 0
  const changePercent = data.changePercent ?? 0
  const up = change >= 0

  return (
    <Card className="relative">
      <CardContent className="pt-3 px-3 pb-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground truncate pr-5">{label}</div>
        <MiniCandles bars={bars} height={36} />
        <div className="space-y-0">
          <div className="text-sm font-bold">
            {data.ltp !== undefined ? data.ltp.toLocaleString('en-IN') : '--'}
          </div>
          <div className={cn('text-xs', up ? 'text-profit' : 'text-loss')}>
            {up ? '+' : ''}
            {change.toFixed(2)} ({up ? '+' : ''}
            {changePercent.toFixed(2)}%)
          </div>
        </div>
        <Link
          to={chartHref(resolved?.symbol ?? symbol, resolved?.exchange ?? exchange)}
          title="Open chart"
          aria-label={`Open chart for ${label}`}
          className="absolute bottom-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Link2 className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  )
}
