import { webClient } from './client'

export interface CandleData {
  timestamp?: string | number
  time?: string | number
  open: number
  high: number
  low: number
  close: number
  volume: number
  oi?: number
}

/** One of the four OI-buildup quadrants, or null when either leg's move is flat. */
export type BuildupTag = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding'

export interface OIProfileChainItem {
  strike: number
  ce_oi: number
  pe_oi: number
  ce_oi_change: number
  pe_oi_change: number
  ce_price_change?: number
  pe_price_change?: number
  ce_buildup?: BuildupTag | null
  pe_buildup?: BuildupTag | null
}

export interface OIProfileDataResponse {
  status: 'success' | 'error'
  message?: string
  underlying?: string
  spot_price?: number
  atm_strike?: number
  lot_size?: number
  expiry_date?: string
  futures_symbol?: string | null
  interval?: string
  candles?: CandleData[]
  oi_chain?: OIProfileChainItem[]
}

export interface IntervalsResponse {
  status: 'success' | 'error'
  data?: { intervals: string[] }
}

export interface UnderlyingsResponse {
  status: 'success' | 'error'
  underlyings: string[]
}

export interface ExpiriesResponse {
  status: 'success' | 'error'
  expiries: string[]
}

export const oiProfileApi = {
  getProfileData: async (params: {
    underlying: string
    exchange: string
    expiry_date: string
    interval: string
    days: number
  }): Promise<OIProfileDataResponse> => {
    const response = await webClient.post<OIProfileDataResponse>(
      '/oiprofile/api/profile-data',
      params
    )
    return response.data
  },

  getIntervals: async (): Promise<IntervalsResponse> => {
    const response = await webClient.get<IntervalsResponse>('/oiprofile/api/intervals')
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
