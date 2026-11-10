/**
 * Groups orders/trades/positions into the instrument categories shown as
 * separate sections on Orderbook, Tradebook and Positions (Groww-style).
 *
 * MTF only survives as a distinct `product` value for brokers whose mapping
 * preserves it (currently Sahi's REVERSE_PRODUCT_MAP: broker/sahi/mapping/
 * transform_data.py). Every other broker normalizes MTF into CNC or NRML
 * before it reaches the frontend, so those rows fall through to Equity.
 */
export type InstrumentCategory = 'Equity' | 'MTF' | 'F&O' | 'Commodity' | 'Currency'

const CATEGORY_ORDER: InstrumentCategory[] = ['Equity', 'MTF', 'F&O', 'Commodity', 'Currency']

const EQUITY_EXCHANGES = new Set(['NSE', 'BSE', 'NSE_INDEX', 'BSE_INDEX', 'GLOBAL_INDEX'])
const FNO_EXCHANGES = new Set(['NFO', 'BFO'])
const COMMODITY_EXCHANGES = new Set(['MCX', 'NCDEX', 'NCO'])
const CURRENCY_EXCHANGES = new Set(['CDS', 'BCD'])

export function getInstrumentCategory(exchange: string, product?: string): InstrumentCategory {
  if (product === 'MTF') return 'MTF'
  if (EQUITY_EXCHANGES.has(exchange)) return 'Equity'
  if (FNO_EXCHANGES.has(exchange)) return 'F&O'
  if (COMMODITY_EXCHANGES.has(exchange)) return 'Commodity'
  if (CURRENCY_EXCHANGES.has(exchange)) return 'Currency'
  return 'F&O'
}

export function sortCategoryKeys<T extends string>(keys: T[]): T[] {
  return [...keys].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a as InstrumentCategory)
    const bi = CATEGORY_ORDER.indexOf(b as InstrumentCategory)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

export function groupByInstrumentCategory<T>(
  items: T[],
  getExchange: (item: T) => string,
  getProduct: (item: T) => string | undefined
): Record<InstrumentCategory, T[]> {
  const groups = {} as Record<InstrumentCategory, T[]>
  for (const item of items) {
    const category = getInstrumentCategory(getExchange(item), getProduct(item))
    if (!groups[category]) groups[category] = []
    groups[category].push(item)
  }
  return groups
}
