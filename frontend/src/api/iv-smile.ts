import { webClient } from './client'

export interface IVSmileChainItem {
  strike: number
  ce_iv: number | null
  pe_iv: number | null
}

export interface IVSmileDataResponse {
  status: 'success' | 'error'
  message?: string
  underlying?: string
  spot_price?: number
  atm_strike?: number
  atm_iv?: number | null
  skew?: number | null
  expiry_date?: string
  chain?: IVSmileChainItem[]
  /** Annualized close-to-close realized vol of the underlying, in IV points. */
  realized_vol_close?: number | null
  /** Annualized Parkinson (high/low range) realized vol, in IV points. */
  realized_vol_parkinson?: number | null
  /** atm_iv - realized_vol_close: positive means options are pricing richer than the underlying has actually moved. */
  vrp?: number | null
  /** Where today's ATM IV sits in its own stored history, 0-100. Null until iv_history_days reaches the minimum. */
  iv_rank?: number | null
  /** Share of stored history days at or below today's ATM IV, 0-100. Null until iv_history_days reaches the minimum. */
  iv_percentile?: number | null
  /** How many prior days of ATM IV are stored for this instrument so far. */
  iv_history_days?: number
}

export interface UnderlyingsResponse {
  status: 'success' | 'error'
  underlyings: string[]
}

export interface ExpiriesResponse {
  status: 'success' | 'error'
  expiries: string[]
}

export const ivSmileApi = {
  getIVSmileData: async (params: {
    underlying: string
    exchange: string
    expiry_date: string
  }): Promise<IVSmileDataResponse> => {
    const response = await webClient.post<IVSmileDataResponse>('/ivsmile/api/iv-smile-data', params)
    return response.data
  },

  getUnderlyings: async (exchange: string): Promise<UnderlyingsResponse> => {
    const response = await webClient.get<UnderlyingsResponse>(
      `/search/api/underlyings?exchange=${exchange}`
    )
    return response.data
  },

  getExpiries: async (exchange: string, underlying: string): Promise<ExpiriesResponse> => {
    const response = await webClient.get<ExpiriesResponse>(
      `/search/api/expiries?exchange=${exchange}&underlying=${underlying}&instrumenttype=options`
    )
    return response.data
  },
}
