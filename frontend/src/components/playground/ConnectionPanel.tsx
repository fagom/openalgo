import { Clock, Globe, Plug, Unplug, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface ConnectionPanelProps {
  isConnected: boolean
  isConnecting: boolean
  isAuthenticated: boolean
  wsUrl: string | null
  lastLatency: number | null
  averageLatency: number | null
  autoReconnect: boolean
  onConnect: () => void
  onDisconnect: () => void
  onAutoReconnectChange: (value: boolean) => void
  onPing: () => void
}

export function ConnectionPanel({
  isConnected,
  isConnecting,
  isAuthenticated,
  wsUrl,
  lastLatency,
  averageLatency,
  autoReconnect,
  onConnect,
  onDisconnect,
  onAutoReconnectChange,
  onPing,
}: ConnectionPanelProps) {
  const getStatusBadge = () => {
    if (isConnecting) {
      return (
        <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
          <div className="h-2 w-2 rounded-full bg-warning mr-2 animate-pulse" />
          Connecting...
        </Badge>
      )
    }

    if (isAuthenticated) {
      return (
        <Badge variant="outline" className="bg-profit/20 text-profit border-profit/30">
          <div className="h-2 w-2 rounded-full bg-success mr-2" />
          Authenticated
        </Badge>
      )
    }

    if (isConnected) {
      return (
        <Badge variant="outline" className="bg-info/20 text-info border-info/30">
          <div className="h-2 w-2 rounded-full bg-info mr-2 animate-pulse" />
          Connected
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="bg-muted/50 text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-muted-foreground mr-2" />
        Disconnected
      </Badge>
    )
  }

  const getLatencyColor = (latency: number | null) => {
    if (!latency) return 'text-muted-foreground'
    if (latency < 100) return 'text-profit'
    if (latency < 300) return 'text-warning'
    return 'text-loss'
  }

  return (
    <div className="bg-card/50 rounded-lg border border-border p-3 space-y-3">
      {/* Status and Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">{getStatusBadge()}</div>
        <div className="flex items-center gap-2">
          {!isConnected && !isConnecting ? (
            <Button
              size="sm"
              className="h-7 px-3 bg-success hover:bg-success/90 text-success-foreground"
              onClick={onConnect}
            >
              <Plug className="size-4 mr-1.5" />
              Connect
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3"
              onClick={onDisconnect}
              disabled={isConnecting}
            >
              <Unplug className="size-4 mr-1.5" />
              Disconnect
            </Button>
          )}
          {isAuthenticated && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3"
              onClick={onPing}
              title="Send ping to measure latency"
            >
              <Zap className="size-4 mr-1.5" />
              Ping
            </Button>
          )}
        </div>
      </div>

      {/* WebSocket URL */}
      {wsUrl && (
        <div className="flex items-center gap-2 text-xs">
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <span className="font-mono text-muted-foreground truncate">{wsUrl}</span>
        </div>
      )}

      {/* Latency Display */}
      {isAuthenticated && (lastLatency !== null || averageLatency !== null) && (
        <div className="flex items-center gap-4 text-xs">
          {lastLatency !== null && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last:</span>
              <span className={cn('font-mono font-medium', getLatencyColor(lastLatency))}>
                {lastLatency}ms
              </span>
            </div>
          )}
          {averageLatency !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Avg:</span>
              <span className={cn('font-mono font-medium', getLatencyColor(averageLatency))}>
                {averageLatency}ms
              </span>
            </div>
          )}
        </div>
      )}

      {/* Auto-reconnect toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground">Auto-reconnect</span>
        <Switch
          checked={autoReconnect}
          onCheckedChange={onAutoReconnectChange}
          disabled={isConnected}
          className="scale-75"
        />
      </div>
    </div>
  )
}
