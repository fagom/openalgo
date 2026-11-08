import { HelpCircle } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface Entry {
  term: string
  what: string
  read: string
}

const STAT_ENTRIES: Entry[] = [
  {
    term: 'Spot / ATM Strike',
    what: 'Spot is the underlying’s current price. ATM Strike is the strike closest to it -- the one option sellers and buyers watch most, since it has the most time value and the highest liquidity.',
    read: 'On their own these are just reference points. Everything else on this page is read relative to them.',
  },
  {
    term: 'PCR (OI)',
    what: 'Put/Call Ratio by open interest: total put OI divided by total call OI across the chain.',
    read: 'Above 1 means more OI sits in puts (often read as bearish positioning, or contrarian bullish once it gets extreme). Below 1 means more OI sits in calls. Near 1 is balanced. PCR describes positioning, not price -- it does not say which way price will move, only where open interest is concentrated.',
  },
  {
    term: 'Max Pain',
    what: 'The strike at which option writers (sellers), in aggregate, would owe the least money at expiry -- found by summing every writer’s loss at each candidate settlement price and taking the minimum.',
    read: 'Price has a documented tendency to drift toward Max Pain as expiry nears, since writers have an incentive to defend it. It is a weak pull, strongest only in the last day or two before expiry, not a magnet that holds all month.',
  },
  {
    term: 'ATM IV',
    what: 'The market’s implied volatility at the ATM strike, back-solved from the option’s traded price via Black-76 -- what the market is pricing for future movement, not what has already happened.',
    read: 'Higher ATM IV means options are pricing a bigger expected move (and cost more); lower means a smaller one. On its own, a single IV reading says little -- it only becomes useful compared against its own history (IV Rank) or against what has actually been happening (VRP), both shown alongside it.',
  },
  {
    term: 'Realized Vol',
    what: '20-day close-to-close volatility of the underlying’s actual daily moves, annualized to the same percentage scale as IV so the two are directly comparable.',
    read: 'This is the past; ATM IV is the market’s forecast for the future. The gap between them is the Variance Risk Premium below.',
  },
  {
    term: 'VRP (Variance Risk Premium)',
    what: 'ATM IV minus Realized Vol.',
    read: 'Positive VRP: options are pricing more movement than the underlying has actually delivered recently -- the classic edge option sellers rely on. Negative VRP: options are pricing less movement than has actually been happening -- a setup more favorable to option buyers, since realized moves have been outrunning what premium is charging for.',
  },
  {
    term: 'IV Rank / IV Percentile',
    what: 'Where today’s ATM IV sits against its own stored history for this specific instrument. Rank is its position between the historical min and max (0-100); Percentile is the share of stored days it was at or above. Both read "Building (Nd)" until 20 days have accumulated -- there is no broker API that supplies a year of past options IV, so this platform builds the history itself, one day at a time, from whenever you first opened this page for the instrument.',
    read: 'Rank/Percentile near 100 means today’s IV is rich for this name specifically (not rich in general) -- a context where selling premium has historically paid better. Near 0 means IV is cheap for this name -- a context more favorable to buying premium cheaply ahead of a possible expansion.',
  },
]

const CHART_ENTRIES: Entry[] = [
  {
    term: 'Price chart',
    what: 'Daily candlesticks for the underlying, the last ~90 calendar days.',
    read: 'Use it the way you would any price chart: higher highs and higher lows for an uptrend, the reverse for a downtrend, a sideways band for consolidation. It is what the Market Regime’s ADX and EMA bias are computed from, so a quick glance here is a sanity check on that card’s read.',
  },
  {
    term: 'Option chain (near ATM)',
    what: 'CE and PE open interest and LTP for the strikes closest to ATM, the same numbers the full Option Chain tool shows, just windowed to a handful of strikes either side.',
    read: 'A strike with unusually heavy OI relative to its neighbours often acts as a support (heavy PE OI below spot) or resistance (heavy CE OI above spot) level -- the "OI wall" traders watch. Use the "OI buildup" link for whether that OI is being added or unwound today, which changes what the wall means.',
  },
]

const REGIME_ENTRIES: Entry[] = [
  {
    term: 'Trend (ADX)',
    what: 'Wilder’s ADX(14) on daily closes: how strongly the underlying is trending, independent of direction. 25+ reads as trending, 20 or under as range-bound, the band between as transitional. The EMA20-vs-EMA50 bias alongside it (up / down / flat) supplies the direction ADX itself does not.',
    read: 'High ADX with a clear EMA bias: a trend is underway and likely to continue short-term. Low ADX: the underlying is chopping sideways, and trend-following setups are more likely to whipsaw.',
  },
  {
    term: 'Net GEX (near ATM)',
    what: 'Net gamma exposure -- call gamma×OI minus put gamma×OI, summed over a handful of strikes around ATM (same formula the full GEX tool uses, same simplifying convention: positive means call-side gamma dominates).',
    read: 'Positive net GEX is read as dealers being net long gamma: their hedging tends to sell into rallies and buy into dips, which dampens moves -- a backdrop that favors range-bound, mean-reverting price action. Negative net GEX is read as dealers net short gamma: their hedging tends to buy into rallies and sell into dips, amplifying whatever move is already underway -- a backdrop that favors trend continuation. This is a heuristic read of dealer positioning, not a measured fact about what any specific dealer is actually holding.',
  },
  {
    term: 'Max Pain pull',
    what: 'How far spot sits from Max Pain, as a percentage, and whether that counts as "pinning" (within 0.5%) or "detached".',
    read: 'Pinning adds weight to a range-bound read, especially close to expiry. Detached on its own says little -- it only means the Max Pain pull is not currently a range-bound signal, not that price is necessarily trending away from it.',
  },
  {
    term: 'IV Rank / VRP (regime context)',
    what: 'The same IV Rank and VRP numbers from the stat cards above, re-used here as a volatility-regime input.',
    read: 'Low IV Rank with non-positive VRP (options cheap, and not even pricing in a premium over realized moves) is read as a compression setup -- more likely to resolve in an expansion/breakout. High IV Rank with positive VRP (options rich, pricing in more than has actually been realized) is read as favoring mean reversion as that rich premium gets sold back down.',
  },
]

export function InstrumentHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="What am I looking at?">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What am I looking at?</DialogTitle>
          <DialogDescription>
            Every figure on this page, what it means, and how to read it. None of this is a signal
            to trade on by itself -- it is several independently-computed readings,
            cross-referenced, the same way a trader would do by eye across several tools. The Market
            Regime card does exactly that combination for you; everything above it is the raw
            material.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-2">Stat cards</h3>
            <Accordion type="single" collapsible className="w-full">
              {STAT_ENTRIES.map((entry) => (
                <AccordionItem key={entry.term} value={entry.term}>
                  <AccordionTrigger className="text-sm">{entry.term}</AccordionTrigger>
                  <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{entry.what}</p>
                    <p>
                      <span className="font-medium text-foreground">Reading it: </span>
                      {entry.read}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Chart and chain</h3>
            <Accordion type="single" collapsible className="w-full">
              {CHART_ENTRIES.map((entry) => (
                <AccordionItem key={entry.term} value={entry.term}>
                  <AccordionTrigger className="text-sm">{entry.term}</AccordionTrigger>
                  <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{entry.what}</p>
                    <p>
                      <span className="font-medium text-foreground">Reading it: </span>
                      {entry.read}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Market Regime signals</h3>
            <Accordion type="single" collapsible className="w-full">
              {REGIME_ENTRIES.map((entry) => (
                <AccordionItem key={entry.term} value={entry.term}>
                  <AccordionTrigger className="text-sm">{entry.term}</AccordionTrigger>
                  <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                    <p>{entry.what}</p>
                    <p>
                      <span className="font-medium text-foreground">Reading it: </span>
                      {entry.read}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>

          <section className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <h3 className="text-sm font-semibold">Putting it together</h3>
            <p className="text-sm text-muted-foreground">
              The Market Regime label is a vote count, not a prediction: each of the four regime
              signals above casts one vote for "trend" or "range" (or abstains if it has nothing to
              say), and the label is whichever side has more. "Trending up/down" means trend signals
              won and the EMA bias agrees on direction. "Range-bound" means range signals won.
              "Transitional" means it was a tie, or too little voted either way -- itself useful
              information: the regime has not committed yet.
            </p>
            <p className="text-sm text-muted-foreground">
              A read worth trusting more is one where the individual signals agree with each other,
              not just with the final label: high ADX with a clear EMA direction AND negative GEX
              AND spot detached from Max Pain is a much stronger "trending" case than a bare label
              with only one signal voting. Check the rationale list under the regime badge -- it
              names every signal that actually voted, so you can see whether the label is built on
              agreement or on a single tie-breaker.
            </p>
            <p className="text-sm text-muted-foreground">
              None of this replaces your own risk management, position sizing or stop discipline. It
              is context for a decision, not the decision itself.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
