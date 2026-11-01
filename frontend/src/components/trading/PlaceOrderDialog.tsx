// components/trading/PlaceOrderDialog.tsx
// Reusable order placement dialog with real-time quotes and market depth
// Uses WebSocket for real-time data with REST API fallback (like Holdings/Positions)

import { useCallback, useEffect, useState } from 'react'
import { tradingApi } from '@/api/trading'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLiveQuote } from '@/hooks/useLiveQuote'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { showToast } from '@/utils/toast'
import { MarketDepthPanel } from './MarketDepthPanel'
import { QuoteHeader } from './QuoteHeader'

// Price types for order dialog
// Backend API accepts: MARKET, LIMIT, SL (Stop Loss Limit), SL-M (Stop Loss Market)
const PRICE_TYPES = [
  { value: 'MARKET', label: 'Market' },
  { value: 'LIMIT', label: 'Limit' },
  { value: 'SL-M', label: 'SL-M' }, // Stop Loss Market (trigger only)
  { value: 'SL', label: 'SL-L' }, // Stop Loss Limit (trigger + price)
] as const

// GTT entry leg accepts only these two — a GTT's own SL/target legs already
// carry their trigger, so there is no SL/SL-M entry type to pick from.
const GTT_ENTRY_PRICE_TYPES = [
  { value: 'LIMIT', label: 'Limit' },
  { value: 'MARKET', label: 'Market' },
] as const

// Product types based on exchange
const FNO_PRODUCT_TYPES = [
  { value: 'NRML', label: 'NRML' },
  { value: 'MIS', label: 'MIS' },
] as const

const EQUITY_PRODUCT_TYPES = [
  { value: 'CNC', label: 'CNC' },
  { value: 'MIS', label: 'MIS' },
] as const

export interface PlaceOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  symbol?: string
  exchange?: string
  action?: 'BUY' | 'SELL'
  quantity?: number
  lotSize?: number
  tickSize?: number
  product?: 'MIS' | 'NRML' | 'CNC'
  priceType?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
  /**
   * Starting limit and trigger prices, for a caller that already has one: a
   * chart row clicked at a price. Left out, a LIMIT or SL ticket fills its
   * price from the live LTP as before.
   */
  price?: number
  triggerPrice?: number
  strategy?: string
  /**
   * Where to send the confirmed order. Left out, it posts through
   * tradingApi.placeOrder as it always has. The chart supplies one so its
   * ticket goes through the terminal's trade feed, which asserts the page's
   * mode against the server before anything is sent; a ticket must not be
   * the one order route that decides on the server's global switch.
   */
  place?: (order: TicketOrder) => Promise<{ orderId: string }>
  /**
   * The element the dialog is portalled into, for a caller that is the
   * fullscreen element: nothing outside it paints, so a dialog on body would
   * open unseen and take focus. Null or absent means body, as before.
   */
  container?: HTMLElement | null
  onSuccess?: (orderId: string) => void
  onError?: (error: string) => void
}

/** The confirmed order, in the shape the placeorder endpoint takes. */
export interface TicketOrder {
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  quantity: number
  pricetype: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
  product: 'MIS' | 'NRML' | 'CNC'
  price?: number
  trigger_price?: number
}

/**
 * The lot count a starting quantity stands for. The box shows lots on a
 * derivative segment while the order carries units, so the two are derived
 * from one figure here rather than seeded separately: a 150-unit ticket on a
 * 75-lot contract reads 2, not 1.
 */
export function lotsFor(quantity: number | undefined, lotSize: number): number {
  if (quantity === undefined || lotSize <= 0) return 1
  return Math.max(1, Math.round(quantity / lotSize))
}

// Tick size validation helpers
function roundToTick(price: number, tickSize: number): number {
  if (tickSize <= 0) return price
  // Use toFixed to avoid floating point precision issues (e.g., 140.95000000000002)
  return Number((Math.round(price / tickSize) * tickSize).toFixed(2))
}

function adjustPrice(price: number, tickSize: number, direction: 'up' | 'down'): number {
  const rounded = roundToTick(price, tickSize)
  if (direction === 'up') {
    return Number((rounded + tickSize).toFixed(2))
  }
  return Math.max(0, Number((rounded - tickSize).toFixed(2)))
}

// Check if exchange is F&O/Commodity/Currency (uses NRML/MIS)
// NSE, BSE = Equity → CNC/MIS
// NFO, BFO, CDS, BCD, MCX, NCDEX, NCO = F&O/Currency/Commodity → NRML/MIS
// CRYPTO = crypto derivatives (utils/constants.py): NRML/MIS in lots, no CNC
function isFnOExchange(exchange: string): boolean {
  return ['NFO', 'BFO', 'MCX', 'CDS', 'BCD', 'NCDEX', 'NCO', 'CRYPTO'].includes(exchange)
}

/** A labeled price input with tick-size +/- steppers, used for every price and trigger field in this dialog. */
function PriceStepper({
  label,
  value,
  tickSize,
  onChange,
  hint,
}: {
  label: string
  value: number
  tickSize: number
  onChange: (value: number) => void
  hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-2"
          onClick={() => onChange(adjustPrice(value, tickSize, 'down'))}
        >
          -
        </Button>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onBlur={() => onChange(roundToTick(value, tickSize))}
          className="flex-1 text-center"
          step={tickSize}
          min={0}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="px-2"
          onClick={() => onChange(adjustPrice(value, tickSize, 'up'))}
        >
          +
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function PlaceOrderDialog({
  open,
  onOpenChange,
  symbol = '',
  exchange = '',
  action: initialAction = 'BUY',
  quantity: initialQuantity,
  lotSize = 1,
  tickSize = 0.05,
  product: initialProduct = 'NRML',
  priceType: initialPriceType = 'MARKET',
  price: initialPrice,
  triggerPrice: initialTriggerPrice,
  strategy = 'OptionChain',
  place,
  container,
  onSuccess,
  onError,
}: PlaceOrderDialogProps) {
  const { apiKey } = useAuthStore()

  // Form state
  const [formAction, setFormAction] = useState<'BUY' | 'SELL'>(initialAction)
  const [formQuantity, setFormQuantity] = useState(initialQuantity ?? lotSize)
  const [formPriceType, setFormPriceType] = useState(initialPriceType)
  const [formProduct, setFormProduct] = useState(initialProduct)
  const [formPrice, setFormPrice] = useState(0)
  const [formTriggerPrice, setFormTriggerPrice] = useState(0)
  // Bracket (GTT OCO): one entry plus a stoploss leg and a target leg, placed
  // as a broker-side conditional order rather than an immediate fill.
  const [orderMode, setOrderMode] = useState<'regular' | 'bracket'>('regular')
  const [bracketEntryType, setBracketEntryType] = useState<'LIMIT' | 'MARKET'>('LIMIT')
  const [slTrigger, setSlTrigger] = useState(0)
  const [slLimit, setSlLimit] = useState(0)
  const [tgTrigger, setTgTrigger] = useState(0)
  const [tgLimit, setTgLimit] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDepthExpanded, setIsDepthExpanded] = useState(false)
  const [quantityMode, setQuantityMode] = useState<'lots' | 'shares'>('lots')
  const [lotMultiplier, setLotMultiplier] = useState(1)

  // Equity trades on either cash exchange. The caller supplies the starting
  // exchange; for NSE/BSE the user may switch, since the same scrip is listed
  // on both. Everything else is contract-specific and stays fixed.
  const [formExchange, setFormExchange] = useState(exchange)
  const exchange_ = formExchange || exchange
  const isEquityExchange = exchange_ === 'NSE' || exchange_ === 'BSE'

  // Get available product types based on exchange. GTT accepts only CNC or
  // NRML — MIS is intraday-only and the backend schema rejects it outright.
  const productTypes = (isFnOExchange(exchange_) ? FNO_PRODUCT_TYPES : EQUITY_PRODUCT_TYPES).filter(
    (pt) => orderMode === 'regular' || pt.value !== 'MIS'
  )

  // Lots are a derivatives concept. Cash equity has no lot size worth showing.
  const usesLots = isFnOExchange(exchange_) && lotSize > 1

  // Centralized live quote + depth with REST fallback (like useLivePrice for Holdings/Positions)
  const {
    data: liveData,
    isLoading: isLoadingQuotes,
    isConnected,
  } = useLiveQuote(symbol, exchange_, {
    enabled: open && !!symbol && !!exchange_,
    mode: 'Depth',
    useQuotesFallback: true,
    useDepthFallback: true,
  })

  // Reset form when dialog opens with new values
  useEffect(() => {
    if (open) {
      setFormAction(initialAction)
      setFormQuantity(initialQuantity ?? lotSize)
      setFormPriceType(initialPriceType)
      // Set default product based on exchange, validate initialProduct is valid for exchange
      const isFnO = isFnOExchange(exchange)
      const defaultProduct = isFnO ? 'NRML' : 'CNC'
      // Validate product: CNC not valid for F&O, NRML not valid for equity
      const validProducts = isFnO ? ['NRML', 'MIS'] : ['CNC', 'MIS']
      const productToUse =
        initialProduct && validProducts.includes(initialProduct) ? initialProduct : defaultProduct
      setFormProduct(productToUse)
      // A supplied price survives the LTP fill below, which only writes over 0.
      setFormPrice(initialPrice ?? 0)
      setFormTriggerPrice(initialTriggerPrice ?? 0)
      setIsDepthExpanded(false)
      // Cash equity has no lots, so the quantity box must show the real share
      // count. Defaulting to 'lots' here displayed lotMultiplier (1) while
      // formQuantity held the actual size -- opening Exit on a 70-share holding
      // showed "1" in the box and would have placed 70.
      setQuantityMode(isFnOExchange(exchange) && lotSize > 1 ? 'lots' : 'shares')
      // Derived from the same figure as formQuantity above, so the Lots box
      // and the order it places agree: the chart's ticket arrives in units
      // for however many lots its pane asked for, and a box reading 1 over
      // an order of 150 is the mistake the ticket exists to prevent.
      setLotMultiplier(lotsFor(initialQuantity, lotSize))
      setFormExchange(exchange)
      setOrderMode('regular')
      setBracketEntryType('LIMIT')
      setSlTrigger(0)
      setSlLimit(0)
      setTgTrigger(0)
      setTgLimit(0)
    }
  }, [
    open,
    initialAction,
    initialQuantity,
    lotSize,
    initialPriceType,
    initialProduct,
    initialPrice,
    initialTriggerPrice,
    exchange,
  ])

  // Use data from centralized hook
  const mergedData = {
    ltp: liveData.ltp,
    close: liveData.close,
    change: liveData.change,
    change_percent: liveData.changePercent,
    bidPrice: liveData.bidPrice,
    askPrice: liveData.askPrice,
    bidSize: liveData.bidSize,
    askSize: liveData.askSize,
    depth: liveData.depth,
  }

  const displayChange = mergedData.change
  const displayChangePercent = mergedData.change_percent

  // Set price to LTP when switching to LIMIT and LTP is available
  useEffect(() => {
    if (formPriceType !== 'MARKET' && mergedData.ltp && formPrice === 0) {
      setFormPrice(roundToTick(mergedData.ltp, tickSize))
    }
  }, [formPriceType, mergedData.ltp, formPrice, tickSize])

  // GTT rejects MIS outright, so switching into bracket mode off a regular
  // MIS ticket needs a product the schema will accept.
  useEffect(() => {
    if (orderMode === 'bracket' && formProduct === 'MIS') {
      setFormProduct(isFnOExchange(exchange_) ? 'NRML' : 'CNC')
    }
  }, [orderMode, formProduct, exchange_])

  // Seed the entry price and both legs from the live LTP once, so the ticket
  // opens with sane numbers instead of zeros the trader must fill blind.
  useEffect(() => {
    if (orderMode !== 'bracket' || !mergedData.ltp) return
    const ltp = roundToTick(mergedData.ltp, tickSize)
    if (formPrice === 0) setFormPrice(ltp)
    if (slTrigger === 0 && slLimit === 0) {
      const sl = roundToTick(
        formAction === 'BUY' ? ltp - tickSize * 20 : ltp + tickSize * 20,
        tickSize
      )
      setSlTrigger(Math.max(0, sl))
      setSlLimit(Math.max(0, sl))
    }
    if (tgTrigger === 0 && tgLimit === 0) {
      const tg = roundToTick(
        formAction === 'BUY' ? ltp + tickSize * 20 : ltp - tickSize * 20,
        tickSize
      )
      setTgTrigger(Math.max(0, tg))
      setTgLimit(Math.max(0, tg))
    }
  }, [
    orderMode,
    mergedData.ltp,
    tickSize,
    formPrice,
    slTrigger,
    slLimit,
    tgTrigger,
    tgLimit,
    formAction,
  ])

  // Validation - determine which price fields are needed:
  // LIMIT: price only
  // SL-M (Stop Loss Market): trigger price only
  // SL (Stop Loss Limit): both price and trigger price
  const needsPrice = formPriceType === 'LIMIT' || formPriceType === 'SL'
  const needsTrigger = formPriceType === 'SL-M' || formPriceType === 'SL'

  const isValid = useCallback(() => {
    if (!symbol || !exchange_) return false
    if (!apiKey) return false
    if (formQuantity <= 0) return false
    if (orderMode === 'bracket') {
      if (formPrice <= 0) return false
      if (slTrigger <= 0 || slLimit <= 0) return false
      if (tgTrigger <= 0 || tgLimit <= 0) return false
      if (slTrigger >= tgTrigger) return false
      return true
    }
    if (needsPrice && formPrice <= 0) return false
    if (needsTrigger && formTriggerPrice <= 0) return false
    return true
  }, [
    symbol,
    exchange_,
    apiKey,
    formQuantity,
    orderMode,
    formPrice,
    slTrigger,
    slLimit,
    tgTrigger,
    tgLimit,
    needsPrice,
    needsTrigger,
    formTriggerPrice,
  ])

  // Submit order
  const handleSubmit = async () => {
    if (!isValid()) {
      showToast.error('Please fill all required fields')
      return
    }

    if (!apiKey) {
      showToast.error('API key not found. Please set up your API key.')
      onError?.('API key not found')
      return
    }

    setIsSubmitting(true)
    try {
      // A bracket places a GTT OCO trigger — a broker-side conditional order,
      // never the caller's own `place` route, which exists to check the
      // live/analyze switch before an immediate fill. The GTT endpoint makes
      // that same check itself.
      if (orderMode === 'bracket') {
        const response = await tradingApi.placeGttOrder({
          apikey: apiKey,
          strategy,
          trigger_type: 'OCO',
          exchange: exchange_,
          symbol,
          action: formAction,
          product: formProduct as 'CNC' | 'NRML',
          quantity: formQuantity,
          pricetype: bracketEntryType,
          price: formPrice,
          triggerprice_sl: slTrigger,
          triggerprice_tg: tgTrigger,
          stoploss: slLimit,
          target: tgLimit,
        })
        if (response.status === 'success') {
          onSuccess?.(response.trigger_id ?? '')
          onOpenChange(false)
        } else {
          const errorMsg = response.message || 'GTT order placement failed'
          showToast.error(errorMsg, 'orders')
          onError?.(errorMsg)
        }
        return
      }

      // Price types are now directly mapped to API values
      // Backend accepts: MARKET, LIMIT, SL (Stop Loss Limit), SL-M (Stop Loss Market)
      const apiPriceType = formPriceType as 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'

      const order: TicketOrder = {
        exchange: exchange_,
        symbol,
        action: formAction,
        quantity: formQuantity,
        pricetype: apiPriceType,
        product: formProduct,
        ...(needsPrice && { price: formPrice }),
        ...(needsTrigger && { trigger_price: formTriggerPrice }),
      }

      // A caller's own route (the chart's trade feed, which checks the mode
      // before it posts) takes the order whole and reports by throwing.
      if (place) {
        const placed = await place(order)
        onSuccess?.(placed.orderId)
        onOpenChange(false)
        return
      }

      const response = await tradingApi.placeOrder({ apikey: apiKey, strategy, ...order })

      // Response structure: { status: "success", orderid: "..." } or { status: "error", message: "..." }
      // Note: orderid is at root level, not in data field
      const orderid = (response as unknown as { orderid?: string }).orderid
      if (response.status === 'success' && orderid) {
        // Toast is shown by useSocket when WebSocket receives order update
        onSuccess?.(orderid)
        onOpenChange(false)
      } else {
        const errorMsg = response.message || 'Order placement failed'
        showToast.error(errorMsg, 'orders')
        onError?.(errorMsg)
      }
    } catch (err: unknown) {
      // Extract error message from axios error response or fallback to error message
      let errorMsg = 'Order placement failed'
      if (err && typeof err === 'object') {
        const axiosError = err as { response?: { data?: { message?: string } }; message?: string }
        if (axiosError.response?.data?.message) {
          errorMsg = axiosError.response.data.message
        } else if (axiosError.message) {
          errorMsg = axiosError.message
        }
      }
      showToast.error(errorMsg, 'orders')
      onError?.(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Quantity change handler
  const handleQuantityChange = (value: string) => {
    const num = parseInt(value, 10) || 0
    if (quantityMode === 'lots') {
      // In lots mode, multiply by lot size
      setFormQuantity(num * lotSize)
      setLotMultiplier(num)
    } else {
      // In shares mode, ensure it's a multiple of lot size
      const roundedQty = Math.max(lotSize, Math.round(num / lotSize) * lotSize)
      setFormQuantity(roundedQty)
      setLotMultiplier(roundedQty / lotSize)
    }
  }

  // Get display quantity based on mode
  const displayQuantity = quantityMode === 'lots' ? lotMultiplier : formQuantity

  // Determine if we're still loading initial data
  const isLoading = isLoadingQuotes && !mergedData.ltp && !isConnected

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px]"
        aria-describedby={undefined}
        container={container}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Place Order -</span>
            <span className={formAction === 'BUY' ? 'text-buy' : 'text-destructive'}>
              {formAction}
            </span>
            <span className="text-muted-foreground font-normal text-sm truncate">{symbol}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Quote Header - merged WebSocket + REST data */}
          <QuoteHeader
            exchange={exchange_}
            ltp={mergedData.ltp}
            prevClose={mergedData.close}
            change={displayChange}
            changePercent={displayChangePercent}
            bidPrice={mergedData.bidPrice}
            askPrice={mergedData.askPrice}
            bidSize={mergedData.bidSize}
            askSize={mergedData.askSize}
            isLoading={isLoading}
          />

          {/* Market Depth Panel - only from WebSocket */}
          <MarketDepthPanel
            depth={mergedData.depth}
            isExpanded={isDepthExpanded}
            onToggle={() => setIsDepthExpanded(!isDepthExpanded)}
            maxLevels={5}
          />

          {/* Action Toggle */}
          <div className="space-y-2">
            <Label className="text-xs">Action</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formAction === 'BUY' ? 'default' : 'outline'}
                className={cn('flex-1', formAction === 'BUY' && 'bg-buy hover:bg-buy/90')}
                onClick={() => setFormAction('BUY')}
              >
                BUY
              </Button>
              <Button
                type="button"
                variant={formAction === 'SELL' ? 'default' : 'outline'}
                className={cn('flex-1', formAction === 'SELL' && 'bg-sell hover:bg-sell/90')}
                onClick={() => setFormAction('SELL')}
              >
                SELL
              </Button>
            </div>
          </div>

          {/* Order Type: a regular immediate order, or a GTT bracket (SL +
              target legs) placed as a broker-side conditional trigger. */}
          <div className="space-y-2">
            <Label className="text-xs">Order Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={orderMode === 'regular' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setOrderMode('regular')}
              >
                Regular
              </Button>
              <Button
                type="button"
                variant={orderMode === 'bracket' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setOrderMode('bracket')}
              >
                Bracket (SL + Target)
              </Button>
            </div>
          </div>

          {/* Quantity with Mode Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Quantity</Label>
              {/* Cash equity trades in shares - there is no lot. Showing a
                  Lots/Shares toggle and "Lot size: 1" on NSE/BSE is noise that
                  implies a concept the segment does not have. */}
              {usesLots && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setQuantityMode('lots')}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded',
                      quantityMode === 'lots'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    Lots
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuantityMode('shares')}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded',
                      quantityMode === 'shares'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    Shares
                  </button>
                </div>
              )}
            </div>
            <Input
              type="number"
              value={displayQuantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              min={1}
            />
            {usesLots && (
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Lot size: {lotSize}</span>
                <span>Total qty: {formQuantity}</span>
              </div>
            )}
          </div>

          {/* Exchange, for cash equity only. The same scrip is listed on both
              NSE and BSE, so the user picks where to route. Derivatives are
              contract-specific and stay on the exchange they came from. */}
          {isEquityExchange && (
            <div className="space-y-2">
              <Label className="text-xs">Exchange</Label>
              <Select value={exchange_} onValueChange={setFormExchange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSE">NSE</SelectItem>
                  <SelectItem value="BSE">BSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Price Type and Product in row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">
                {orderMode === 'bracket' ? 'Entry Type' : 'Price Type'}
              </Label>
              {orderMode === 'bracket' ? (
                <Select
                  value={bracketEntryType}
                  onValueChange={(v) => setBracketEntryType(v as typeof bracketEntryType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GTT_ENTRY_PRICE_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={formPriceType}
                  onValueChange={(v) => setFormPriceType(v as typeof formPriceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Product</Label>
              <Select
                value={formProduct}
                onValueChange={(v) => setFormProduct(v as typeof formProduct)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {orderMode === 'bracket' ? (
            <>
              <PriceStepper
                label="Entry Price"
                value={formPrice}
                tickSize={tickSize}
                onChange={setFormPrice}
                hint={`Tick size: ${tickSize}`}
              />
              <div className="grid grid-cols-2 gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                <PriceStepper
                  label="Stoploss Trigger"
                  value={slTrigger}
                  tickSize={tickSize}
                  onChange={setSlTrigger}
                />
                <PriceStepper
                  label="Stoploss Limit"
                  value={slLimit}
                  tickSize={tickSize}
                  onChange={setSlLimit}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-success/30 bg-success/5 p-2">
                <PriceStepper
                  label="Target Trigger"
                  value={tgTrigger}
                  tickSize={tickSize}
                  onChange={setTgTrigger}
                />
                <PriceStepper
                  label="Target Limit"
                  value={tgLimit}
                  tickSize={tickSize}
                  onChange={setTgLimit}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Placed as a GTT: the broker holds it and fires whichever leg triggers first,
                cancelling the other.
              </p>
            </>
          ) : (
            <>
              {needsPrice && (
                <PriceStepper
                  label="Price"
                  value={formPrice}
                  tickSize={tickSize}
                  onChange={setFormPrice}
                  hint={`Tick size: ${tickSize}`}
                />
              )}
              {needsTrigger && (
                <PriceStepper
                  label="Trigger Price"
                  value={formTriggerPrice}
                  tickSize={tickSize}
                  onChange={setFormTriggerPrice}
                />
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className={cn(
              formAction === 'BUY'
                ? 'bg-buy hover:bg-buy/90'
                : 'bg-destructive hover:bg-destructive/90'
            )}
          >
            {isSubmitting
              ? 'Placing...'
              : orderMode === 'bracket'
                ? `Place ${formAction} Bracket (GTT)`
                : `Place ${formAction} Order`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
