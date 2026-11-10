import { describe, expect, it } from 'vitest'
import type { OptionStrike } from '@/types/option-chain'
import {
  changeFromClose,
  daysToExpiry,
  isInTheMoney,
  maxOiStrikes,
  spotMarkerIndex,
} from './optionChainView'

const row = (strike: number, ceOi = 0, peOi = 0) =>
  ({ strike, ce: { oi: ceOi }, pe: { oi: peOi } }) as unknown as OptionStrike

describe('isInTheMoney', () => {
  it('shades calls below spot and puts above it', () => {
    expect(isInTheMoney('ce', 23100, 23140.5)).toBe(true)
    expect(isInTheMoney('ce', 23150, 23140.5)).toBe(false)
    expect(isInTheMoney('pe', 23150, 23140.5)).toBe(true)
    expect(isInTheMoney('pe', 23100, 23140.5)).toBe(false)
  })

  it('decides from spot, not the ATM label, for the strike just past spot', () => {
    // 23150 is labelled ATM (nearest strike) but is above spot: a call there is OTM.
    expect(isInTheMoney('ce', 23150, 23140.5)).toBe(false)
  })

  it('shades nothing without a spot', () => {
    expect(isInTheMoney('ce', 23100, 0)).toBe(false)
    expect(isInTheMoney('pe', 23100, Number.NaN)).toBe(false)
  })
})

describe('spotMarkerIndex', () => {
  const chain = [row(23000), row(23050), row(23100), row(23150), row(23200)]

  it('places the marker before the first strike at or above spot', () => {
    expect(spotMarkerIndex(chain, 23140.5)).toBe(3)
    expect(spotMarkerIndex(chain, 23100)).toBe(2)
  })

  it('draws no marker when spot is off the loaded strikes', () => {
    expect(spotMarkerIndex(chain, 22900)).toBe(-1)
    expect(spotMarkerIndex(chain, 23300)).toBe(-1)
    expect(spotMarkerIndex([], 23100)).toBe(-1)
  })
})

describe('maxOiStrikes', () => {
  it('finds the heaviest call and put strikes', () => {
    const chain = [row(23000, 10, 90), row(23100, 40, 30), row(23200, 80, 5)]
    expect(maxOiStrikes(chain)).toEqual({ ce: 23200, pe: 23000 })
  })

  it('reports none for a side with no open interest', () => {
    expect(maxOiStrikes([row(23000), row(23100)])).toEqual({ ce: null, pe: null })
  })
})

describe('changeFromClose', () => {
  it('signs the move against the previous close', () => {
    expect(changeFromClose(110, 100)).toEqual({ change: 10, percent: 10 })
    expect(changeFromClose(90, 100)?.percent).toBeCloseTo(-10)
  })

  it('returns null without a usable close', () => {
    expect(changeFromClose(110, 0)).toBeNull()
    expect(changeFromClose(undefined, 100)).toBeNull()
  })
})

describe('daysToExpiry', () => {
  const now = new Date(2026, 8, 28, 1, 30)

  it('counts calendar days to a DD-MMM-YY expiry', () => {
    expect(daysToExpiry('29-SEP-26', now)).toBe(1)
    expect(daysToExpiry('28-SEP-26', now)).toBe(0)
    expect(daysToExpiry('27-OCT-2026', now)).toBe(29)
  })

  it('degrades to null on a format it does not know', () => {
    expect(daysToExpiry('2026-09-29', now)).toBeNull()
    expect(daysToExpiry('29-XYZ-26', now)).toBeNull()
  })
})
