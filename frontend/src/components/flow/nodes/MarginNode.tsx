import { Handle, Position } from '@xyflow/react'
import { Calculator } from 'lucide-react'
import { memo } from 'react'
import { parseLegs } from '@/lib/flow/marginPositions'
import { cn } from '@/lib/utils'

interface MarginNodeData {
  label?: string
  // The editor stores the basket as a raw JSON string under positionsJson; the
  // `positions` array this used to declare was never written by anything, so
  // the node badge read "Positions: 0" for every margin node.
  positionsJson?: string
  outputVariable?: string
}

interface MarginNodeProps {
  data: MarginNodeData
  selected?: boolean
}

export const MarginNode = memo(({ data, selected }: MarginNodeProps) => {
  const { legs } = parseLegs(data.positionsJson ?? '')
  const positionCount = legs.length

  return (
    <div className={cn('workflow-node min-w-[120px] border-l-warning/60', selected && 'selected')}>
      <Handle type="target" position={Position.Top} />
      <div className="p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-warning/20 text-warning">
            <Calculator className="size-4" />
          </div>
          <div>
            <div className="text-xs font-medium leading-tight">Margin Calc</div>
            <div className="text-[9px] text-muted-foreground">Risk Check</div>
          </div>
        </div>
        <div className="mt-1 space-y-0.5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Positions:</span>
            <span className="mono-data font-medium">{positionCount}</span>
          </div>
          {data.outputVariable && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Output:</span>
              <span className="mono-data text-warning">{`{{${data.outputVariable}}}`}</span>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})

MarginNode.displayName = 'MarginNode'
