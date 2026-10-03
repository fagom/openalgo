/**
 * Presentation rules for the /optionchain page, kept apart from React so they
 * can be tested directly. Each one encodes a convention traders read a chain
 * by, so getting one backwards (shading the wrong side, marking spot in the
 * wrong gap) misleads rather than merely looks odd.
 */
import type { OptionStrike } from '@/types/option-chain'

/**
 * In the money, decided from the live spot rather than the ATM label, which is
 * only the nearest strike and so is wrong for the half-strike either side.
 * A call is ITM below spot, a put above it.
 */
export function isInTheMoney(side: 'ce' | 'pe', strike: number, spot: number): boolean {
  if (!Number.isFinite(spot) || spot <= 0) return false
  return side === 'ce' ? strike < spot : strike > spot
}

/**
 * Index of the first strike at or above spot: the spot marker is drawn just
 * before that row. -1 when spot is unknown or outside the loaded strikes, in
 * which case no marker is drawn rather than one pinned to an edge.
 */
export function spotMarkerIndex(chain: readonly OptionStrike[], spot: number): number {
  if (!Number.isFinite(spot) || spot <= 0 || chain.length === 0) return -1
  if (spot < chain[0].strike || spot > chain[chain.length - 1].strike) return -1
  return chain.findIndex((s) => s.strike >= spot)
}

/**
 * The strikes carrying the most open interest on each side. Read by traders as
 * resistance (calls written above the market) and support (puts written below
 * it). Null when a side has no open interest at all.
 */
export function maxOiStrikes(chain: readonly OptionStrike[]): {
  ce: number | null
  pe: number | null
} {
  let ce: number | null = null
  let pe: number | null = null
  let ceMax = 0
  let peMax = 0
  for (const s of chain) {
    const c = s.ce?.oi ?? 0
    const p = s.pe?.oi ?? 0
    if (c > ceMax) {
      ceMax = c
      ce = s.strike
    }
    if (p > peMax) {
      peMax = p
      pe = s.strike
    }
  }
  return { ce, pe }
}

/** Change and percent change from the previous close; null without a usable close. */
export function changeFromClose(
  ltp: number | undefined,
  prevClose: number | undefined
): { change: number; percent: number } | null {
  if (ltp === undefined || prevClose === undefined) return null
  if (!Number.isFinite(ltp) || !Number.isFinite(prevClose) || prevClose <= 0 || ltp <= 0)
    return null
  const change = ltp - prevClose
  return { change, percent: (change / prevClose) * 100 }
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * Calendar days from today to an expiry written `DD-MMM-YY` (`29-SEP-26`), as
 * the expiry picker lists them. Expiry day itself counts as 0. Null for a
 * string that does not parse, so a new format degrades to no label.
 */
export function daysToExpiry(expiry: string, now: Date = new Date()): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(expiry.trim())
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toUpperCase())
  if (month < 0) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  const expiryDay = Date.UTC(year, month, Number(m[1]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((expiryDay - today) / 86_400_000)
}
