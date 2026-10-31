/**
 * Math Expression Node
 * Evaluates mathematical expressions with variable interpolation
 * Supports: +, -, *, /, %, ^, parentheses, and {{variables}}
 */

import { Handle, Position } from '@xyflow/react'
import { Sigma } from 'lucide-react'
import { memo } from 'react'
import { cn } from '@/lib/utils'

interface MathExpressionNodeProps {
  data: {
    label?: string
    expression?: string
    outputVariable?: string
  }
  selected?: boolean
}

export const MathExpressionNode = memo(({ data, selected }: MathExpressionNodeProps) => {
  const expression = data.expression || ''
  const outputVar = data.outputVariable || 'result'

  // Truncate expression for display
  const displayExpr = expression.length > 25 ? `${expression.substring(0, 22)}...` : expression

  return (
    <div
      className={cn(
        'workflow-node min-w-[140px] border-chart-4/50 bg-chart-4/5',
        selected && 'selected'
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-chart-4" />
      <div className="p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="node-icon bg-chart-4/20">
            <Sigma className="size-4 text-chart-4" />
          </div>
          <span className="node-title">Math</span>
        </div>

        {expression ? (
          <div className="space-y-1">
            <div className="rounded bg-muted/50 px-2 py-1">
              <code className="text-[10px] text-chart-4 font-mono">{displayExpr}</code>
            </div>
            <div className="text-[9px] text-muted-foreground text-center">{outputVar} = ...</div>
          </div>
        ) : (
          <div className="rounded bg-muted/50 px-2 py-1 text-center">
            <span className="text-[10px] text-muted-foreground">Configure expression</span>
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-chart-4" />
    </div>
  )
})

MathExpressionNode.displayName = 'MathExpressionNode'
