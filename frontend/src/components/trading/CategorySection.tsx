import { ChevronDown, ChevronRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Collapsible instrument-category block -- Groww's "Commodities (2)" /
 * "MTF positions (1)" card: a header with a title, count and optional
 * summary strip, collapsing a table/list body underneath.
 */
export function CategorySection({
  title,
  count,
  summary,
  defaultOpen = true,
  className,
  children,
}: {
  title: string
  count: number
  summary?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className={className}>
      <button
        type="button"
        className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="font-semibold">
            {title} <span className="font-normal text-muted-foreground">({count})</span>
          </span>
        </div>
        {summary && (
          <div className="flex items-center gap-6 text-sm" onClick={(e) => e.stopPropagation()}>
            {summary}
          </div>
        )}
      </button>
      {open && <CardContent className={cn('pt-0')}>{children}</CardContent>}
    </Card>
  )
}
