// components/trading/StrikeProfileDialog.tsx
// Strike Profile (GEX/DEX), launched from the /trading right-click menu
// over the pane it was opened from, seeded with that pane's underlying.

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { StrikeProfileModalView } from './StrikeProfileModalView'

export interface StrikeProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** FnO exchange to default to (NFO, BFO, ...). */
  exchange?: string
  /** Underlying to seed the view with, e.g. the chart's own symbol. */
  underlying?: string
}

export function StrikeProfileDialog({
  open,
  onOpenChange,
  exchange,
  underlying,
}: StrikeProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex h-[85vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-4 sm:max-w-4xl"
      >
        <StrikeProfileModalView exchange={exchange} underlying={underlying} />
      </DialogContent>
    </Dialog>
  )
}
