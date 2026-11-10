// components/trading/StraddleDialog.tsx
// Straddle chart, launched from the /trading right-click menu over the pane
// it was opened from, seeded with that pane's underlying.

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { StraddleModalView } from './StraddleModalView'

export interface StraddleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the chart with, e.g. the chart's own symbol. */
  underlying?: string
}

export function StraddleDialog({ open, onOpenChange, exchange, underlying }: StraddleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[85vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-4 sm:max-w-4xl"
      >
        <StraddleModalView exchange={exchange} underlying={underlying} />
      </DialogContent>
    </Dialog>
  )
}
