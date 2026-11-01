// components/trading/OptionChainDialog.tsx
// Option Chain, launched from the /trading right-click menu over the pane
// it was opened from, seeded with that pane's underlying.

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { OptionChainModalView } from './OptionChainModalView'

export interface OptionChainDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the chain with, e.g. the chart's own symbol. */
  underlying?: string
}

export function OptionChainDialog({
  open,
  onOpenChange,
  exchange,
  underlying,
}: OptionChainDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[85vh] w-[95vw] max-w-5xl flex-col overflow-hidden p-4 sm:max-w-5xl"
      >
        <OptionChainModalView exchange={exchange} underlying={underlying} />
      </DialogContent>
    </Dialog>
  )
}
