// components/flow/panels/NodePalette.tsx
// Left sidebar with draggable node items organized by category

import {
  Activity,
  BarChart3,
  Bell,
  Briefcase,
  Calculator,
  Calendar,
  CalendarClock,
  CalendarRange,
  CalendarX,
  ClipboardList,
  Clock,
  FileSearch,
  FileText,
  Globe,
  Grid3X3,
  Group,
  History,
  Hourglass,
  Layers,
  Layers3,
  MessageCircle,
  Package,
  PackageCheck,
  Pencil,
  Radio,
  RadioTower,
  Receipt,
  Send,
  Shield,
  ShoppingCart,
  Sigma,
  SlidersHorizontal,
  Split,
  Square,
  Tag,
  Target,
  Timer,
  TrendingUp,
  Variable,
  Wallet,
  Webhook,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface NodeItemProps {
  type: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  onDragStart: (event: React.DragEvent, nodeType: string) => void
  onAdd: (nodeType: string) => void
}

function NodeItem({ type, label, description, icon, color, onDragStart, onAdd }: NodeItemProps) {
  // Dragging was the only way to place a node: this was a plain div with no
  // role, no tab stop and no activation handler of any kind - not even a click.
  // A keyboard user could not add the first node to a graph at all, because the
  // one alternative (the + button on an edge) only inserts between two nodes
  // that are already connected.
  return (
    <button
      type="button"
      draggable
      aria-label={`Add ${label} node`}
      onDragStart={(e) => onDragStart(e, type)}
      onClick={() => onAdd(type)}
      className={cn(
        'group w-full cursor-grab rounded-lg border border-border bg-card p-2.5 text-left',
        'transition-all duration-200 hover:border-primary/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:cursor-grabbing'
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', color)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{label}</div>
          <div className="truncate text-[10px] text-muted-foreground">{description}</div>
        </div>
      </div>
    </button>
  )
}

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, nodeType: string) => void
  onAdd: (nodeType: string) => void
}

export function NodePalette({ onDragStart, onAdd }: NodePaletteProps) {
  const triggers = [
    {
      type: 'start',
      label: 'Schedule',
      description: 'Start on schedule',
      icon: <Clock className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'priceAlert',
      label: 'Price Alert',
      description: 'Trigger on price',
      icon: <Bell className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'webhookTrigger',
      label: 'Webhook',
      description: 'External trigger',
      icon: <Webhook className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'orderUpdateTrigger',
      label: 'Order Update',
      description: 'Trigger on fill/reject',
      icon: <PackageCheck className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
  ]

  const actions = [
    {
      type: 'placeOrder',
      label: 'Place Order',
      description: 'Basic order',
      icon: <ShoppingCart className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'smartOrder',
      label: 'Smart Order',
      description: 'Position-aware',
      icon: <Zap className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'optionsOrder',
      label: 'Options Order',
      description: 'ATM/ITM/OTM',
      icon: <TrendingUp className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'optionsMultiOrder',
      label: 'Multi-Leg',
      description: 'Options strategies',
      icon: <Layers className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'basketOrder',
      label: 'Basket Order',
      description: 'Multiple orders',
      icon: <Package className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'splitOrder',
      label: 'Split Order',
      description: 'Large order split',
      icon: <Split className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'modifyOrder',
      label: 'Modify Order',
      description: 'Edit order',
      icon: <Pencil className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'cancelOrder',
      label: 'Cancel Order',
      description: 'Cancel by ID',
      icon: <XCircle className="size-4 text-destructive" />,
      color: 'bg-destructive/10',
    },
    {
      type: 'cancelAllOrders',
      label: 'Cancel All',
      description: 'Cancel orders',
      icon: <XCircle className="size-4 text-destructive" />,
      color: 'bg-destructive/10',
    },
    {
      type: 'closePositions',
      label: 'Close Positions',
      description: 'Square off all',
      icon: <Square className="size-4 text-destructive" />,
      color: 'bg-destructive/10',
    },
  ]

  const conditions = [
    {
      type: 'timeCondition',
      label: 'Time Condition',
      description: 'Entry/Exit time',
      icon: <Clock className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'positionCheck',
      label: 'Position Check',
      description: 'Check position',
      icon: <Briefcase className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'fundCheck',
      label: 'Fund Check',
      description: 'Check funds',
      icon: <Wallet className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'priceCondition',
      label: 'Price Check',
      description: 'Check price',
      icon: <TrendingUp className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'timeWindow',
      label: 'Time Window',
      description: 'Market hours',
      icon: <Clock className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'andGate',
      label: 'AND Gate',
      description: 'All must be true',
      icon: <span className="text-[9px] font-bold text-chart-4">AND</span>,
      color: 'bg-chart-4/10',
    },
    {
      type: 'orGate',
      label: 'OR Gate',
      description: 'Any can be true',
      icon: <span className="text-[9px] font-bold text-chart-4">OR</span>,
      color: 'bg-chart-4/10',
    },
    {
      type: 'notGate',
      label: 'NOT Gate',
      description: 'Invert condition',
      icon: <span className="text-[9px] font-bold text-chart-4">NOT</span>,
      color: 'bg-chart-4/10',
    },
    {
      type: 'varCondition',
      label: 'Var Condition',
      description: 'Compare any two values',
      icon: <SlidersHorizontal className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
  ]

  const data = [
    {
      type: 'getQuote',
      label: 'Get Quote',
      description: 'Real-time quote',
      icon: <BarChart3 className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'getDepth',
      label: 'Get Depth',
      description: 'Bid/ask depth',
      icon: <Layers3 className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'getOrderStatus',
      label: 'Order Status',
      description: 'Check order',
      icon: <FileSearch className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'history',
      label: 'History',
      description: 'OHLCV data',
      icon: <TrendingUp className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'indicator',
      label: 'Indicator',
      description: 'Any technical indicator',
      icon: <Activity className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'strategyPnl',
      label: 'Strategy P&L',
      description: 'Per-strategy realized/unrealized',
      icon: <Wallet className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'priorPeriodOhlc',
      label: 'Prior Period OHLC',
      description: 'Prev hour/day/week/month',
      icon: <CalendarClock className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'barOffset',
      label: 'Bar Offset',
      description: 'OHLCV N bars back',
      icon: <History className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'openPosition',
      label: 'Open Position',
      description: 'Get position',
      icon: <Briefcase className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'expiry',
      label: 'Expiry Dates',
      description: 'F&O expiry',
      icon: <Calendar className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'intervals',
      label: 'Intervals',
      description: 'Broker timeframes',
      icon: <Clock className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'calendar',
      label: 'Calendar',
      description: 'New day / week / month',
      icon: <CalendarRange className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'multiQuotes',
      label: 'Multi Quotes',
      description: 'Multiple symbols',
      icon: <BarChart3 className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'symbol',
      label: 'Symbol Info',
      description: 'Get symbol details',
      icon: <Tag className="size-4 text-chart-3" />,
      color: 'bg-chart-3/10',
    },
    {
      type: 'optionSymbol',
      label: 'Option Symbol',
      description: 'Resolve options',
      icon: <Target className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'orderBook',
      label: 'Order Book',
      description: 'All orders',
      icon: <ClipboardList className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'tradeBook',
      label: 'Trade Book',
      description: 'Executed trades',
      icon: <Receipt className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'positionBook',
      label: 'Position Book',
      description: 'All positions',
      icon: <Briefcase className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'syntheticFuture',
      label: 'Synthetic Future',
      description: 'Calc future price',
      icon: <Calculator className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'optionChain',
      label: 'Option Chain',
      description: 'Full chain data',
      icon: <Grid3X3 className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'holdings',
      label: 'Holdings',
      description: 'Portfolio holdings',
      icon: <Briefcase className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'funds',
      label: 'Funds',
      description: 'Account balance',
      icon: <Wallet className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'margin',
      label: 'Margin Calc',
      description: 'Margin required',
      icon: <Shield className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
  ]

  const streaming = [
    {
      type: 'subscribeLtp',
      label: 'Subscribe LTP',
      description: 'Live price stream',
      icon: <Radio className="size-4 text-profit" />,
      color: 'bg-profit/10',
    },
    {
      type: 'subscribeQuote',
      label: 'Subscribe Quote',
      description: 'Live OHLC stream',
      icon: <RadioTower className="size-4 text-success" />,
      color: 'bg-success/10',
    },
    {
      type: 'subscribeDepth',
      label: 'Subscribe Depth',
      description: 'Live order book',
      icon: <Layers3 className="size-4 text-success" />,
      color: 'bg-success/10',
    },
    {
      type: 'unsubscribe',
      label: 'Unsubscribe',
      description: 'Stop streaming',
      icon: <WifiOff className="size-4 text-destructive" />,
      color: 'bg-destructive/10',
    },
  ]

  const utilities = [
    {
      type: 'variable',
      label: 'Variable',
      description: 'Store values',
      icon: <Variable className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'mathExpression',
      label: 'Math',
      description: 'Calculate expression',
      icon: <Sigma className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'log',
      label: 'Log',
      description: 'Debug message',
      icon: <FileText className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'telegramAlert',
      label: 'Telegram',
      description: 'Send alert',
      icon: <Send className="size-4 text-[#0088cc]" />,
      color: 'bg-[#0088cc]/10',
    },
    {
      type: 'whatsappAlert',
      label: 'WhatsApp',
      description: 'Send alert',
      icon: <MessageCircle className="size-4 text-[#25D366]" />,
      color: 'bg-[#25D366]/10',
    },
    {
      type: 'delay',
      label: 'Delay',
      description: 'Wait duration',
      icon: <Timer className="size-4 text-muted-foreground" />,
      color: 'bg-muted',
    },
    {
      type: 'waitUntil',
      label: 'Wait Until',
      description: 'Wait until time',
      icon: <Hourglass className="size-4 text-warning" />,
      color: 'bg-warning/10',
    },
    {
      type: 'group',
      label: 'Group',
      description: 'Group nodes',
      icon: <Group className="size-4 text-muted-foreground" />,
      color: 'bg-muted',
    },
    {
      type: 'httpRequest',
      label: 'HTTP Request',
      description: 'API call',
      icon: <Globe className="size-4 text-primary" />,
      color: 'bg-primary/10',
    },
    {
      type: 'holidays',
      label: 'Holidays',
      description: 'Market holidays',
      icon: <CalendarX className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
    {
      type: 'timings',
      label: 'Timings',
      description: 'Market hours',
      icon: <Clock className="size-4 text-chart-4" />,
      color: 'bg-chart-4/10',
    },
  ]

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="shrink-0 border-b border-border p-3">
        <h2 className="text-sm font-semibold">Nodes</h2>
        <p className="text-[10px] text-muted-foreground">Drag nodes to the canvas</p>
      </div>
      <Tabs defaultValue="triggers" className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 border-b border-border px-1 py-1.5">
          <TabsList className="h-7 w-full">
            <TabsTrigger value="triggers" className="flex-1 text-[8px] px-0.5">
              Trigger
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1 text-[8px] px-0.5">
              Action
            </TabsTrigger>
            <TabsTrigger value="data" className="flex-1 text-[8px] px-0.5">
              Data
            </TabsTrigger>
            <TabsTrigger value="stream" className="flex-1 text-[8px] px-0.5">
              Stream
            </TabsTrigger>
            <TabsTrigger value="conditions" className="flex-1 text-[8px] px-0.5">
              Logic
            </TabsTrigger>
            <TabsTrigger value="utilities" className="flex-1 text-[8px] px-0.5">
              Util
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 min-h-0 relative">
          <TabsContent value="triggers" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {triggers.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="actions" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {actions.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="data" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {data.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="stream" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {streaming.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="conditions" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {conditions.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="utilities" className="m-0 absolute inset-0">
            <ScrollArea className="h-full">
              <div className="space-y-1.5 p-2">
                {utilities.map((node) => (
                  <NodeItem key={node.type} {...node} onDragStart={onDragStart} onAdd={onAdd} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
