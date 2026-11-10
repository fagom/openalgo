import { webClient } from './client'

export interface OverviewOptionLeg {
  symbol: string
  label: string
  ltp: number
  oi: number
  volume: number
}

export interface OverviewStrike {
  strike: number
  ce: OverviewOptionLeg | null
  pe: OverviewOptionLeg | null
}

export interface OverviewDailyBar {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface MarketRegime {
  label: string
  votes_trend: number
  votes_range: number
  rationale: string[]
}

export interface InstrumentOverviewResponse {
  status: 'success' | 'error'
  message?: string
  underlying?: string
  underlying_symbol?: string
  underlying_exchange?: string
  spot_price?: number
  atm_strike?: number
  expiry_date?: string
  pcr?: number | null
  max_pain_strike?: number | null
  /** % distance from spot to Max Pain: positive means spot is above it. */
  max_pain_pct?: number
  max_pain_state?: 'pinning' | 'detached' | 'unknown'
  atm_iv?: number | null
  realized_vol_close?: number | null
  realized_vol_parkinson?: number | null
  vrp?: number | null
  iv_rank?: number | null
  iv_percentile?: number | null
  iv_history_days?: number
  /** Wilder's ADX(14) on daily closes: trend strength, independent of direction. */
  adx?: number | null
  trend_bias?: 'up' | 'down' | 'flat'
  /** Net gamma exposure (call - put) over strikes near ATM; positive reads as dealers long gamma (dampening), negative as short gamma (amplifying). */
  net_gex?: number | null
  regime?: MarketRegime
  daily_bars?: OverviewDailyBar[]
  chain?: OverviewStrike[]
}

export const instrumentOverviewApi = {
  getOverview: async (params: {
    underlying: string
    exchange: string
    expiry_date: string
  }): Promise<InstrumentOverviewResponse> => {
    const response = await webClient.post<InstrumentOverviewResponse>(
      '/instrument/api/overview',
      params
    )
    return response.data
  },
}
