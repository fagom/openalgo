import { cn } from '@/lib/utils'

export type StatusDotColor = 'success' | 'destructive' | 'muted' | 'primary' | 'warning'

const DOT_COLOR: Record<StatusDotColor, string> = {
  success: 'bg-success',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground',
  primary: 'bg-primary',
  warning: 'bg-warning',
}

const TEXT_COLOR: Record<StatusDotColor, string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  warning: 'text-warning',
}

interface StatusDotProps {
  color: StatusDotColor
  label: string
  className?: string
}

/**
 * A small colored dot next to a status label -- Groww's order/trade status
 * treatment, used here in place of an icon-and-badge combination. Lighter
 * on a dense row than a filled badge pill, and the color alone is readable
 * at a glance across a long list without the label competing for attention.
 */
export function StatusDot({ color, label, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', TEXT_COLOR[color], className)}>
      <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT_COLOR[color])} />
      {label}
    </span>
  )
}
