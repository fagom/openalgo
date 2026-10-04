import { Clock, RotateCcw, Sliders, TrendingUp, Waves } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SliderRowProps {
  icon: ReactNode
  label: string
  accessibleLabel: string
  sublabel: string
  value: number
  min: number
  max: number
  step: number
  formatter: (v: number) => string
  onChange: (v: number) => void
  disabled?: boolean
  accent?: 'pink' | 'violet' | 'blue'
  centered?: boolean
}

function SliderRow({
  icon,
  label,
  accessibleLabel,
  sublabel,
  value,
  min,
  max,
  step,
  formatter,
  onChange,
  disabled = false,
  accent = 'violet',
  centered = false,
}: SliderRowProps) {
  // Note: keep the native range appearance so the browser paints the thumb
  // — we tint only the track (accent-*) and rely on the user agent for thumb
  // rendering, which gives us a visible, high-contrast circle in every
  // theme (light, dark, and our analyzer theme). A fully custom thumb via
  // ::webkit-slider-thumb { appearance:none } was invisible on light mode
  // because Tailwind utilities inside pseudo-selectors aren't composed the
  // way the `accent` utility is.
  const accentTrack = {
    pink: 'accent-primary',
    violet: 'accent-chart-4',
    blue: 'accent-primary',
  }[accent]

  const accentBg = {
    pink: 'from-primary/15 to-primary/0 text-primary',
    violet: 'from-chart-4/15 to-chart-4/0 text-chart-4',
    blue: 'from-primary/15 to-primary/0 text-primary',
  }[accent]

  const accentValue = {
    pink: 'text-primary',
    violet: 'text-chart-4',
    blue: 'text-primary',
  }[accent]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br',
            accentBg
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold leading-none">{label}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{sublabel}</div>
        </div>
        <span className={cn('text-sm font-semibold tabular-nums', accentValue)}>
          {formatter(value)}
        </span>
      </div>
      <div className="relative px-1">
        <input
          type="range"
          aria-label={accessibleLabel}
          aria-valuetext={formatter(value)}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            'h-2 w-full cursor-pointer rounded-full bg-muted outline-none',
            accentTrack,
            disabled && 'cursor-not-allowed opacity-50'
          )}
        />
        {/* Center tick for bipolar sliders */}
        {centered && (
          <span
            className="pointer-events-none absolute top-1/2 h-2 w-[2px] -translate-y-1/2 rounded-full bg-border"
            style={{ left: `${((0 - min) / (max - min)) * 100}%` }}
          />
        )}
        <div className="mt-1 flex justify-between text-[9px] font-medium tabular-nums text-muted-foreground/70">
          <span>{formatter(min)}</span>
          {centered && <span className="opacity-60">0</span>}
          <span>{formatter(max)}</span>
        </div>
      </div>
    </div>
  )
}

export interface SimulatorsProps {
  spotShiftPct: number
  ivShiftPct: number
  daysElapsed: number
  maxDays: number
  onSpotShiftChange: (v: number) => void
  onIvShiftChange: (v: number) => void
  onDaysElapsedChange: (v: number) => void
  onReset: () => void
}

export function Simulators({
  spotShiftPct,
  ivShiftPct,
  daysElapsed,
  maxDays,
  onSpotShiftChange,
  onIvShiftChange,
  onDaysElapsedChange,
  onReset,
}: SimulatorsProps) {
  const maxShiftedDays = Math.max(0, maxDays)
  const hasTimeRemaining = maxShiftedDays > 0
  const isSubDay = maxShiftedDays < 1
  const maxHourlyStep = 1 / 24
  const timePartitions =
    isSubDay && maxShiftedDays > 0 ? Math.ceil(maxShiftedDays / maxHourlyStep) : 0
  const timeSliderValue =
    isSubDay && timePartitions > 0
      ? Math.round((Math.min(daysElapsed, maxShiftedDays) / maxShiftedDays) * timePartitions)
      : daysElapsed
  const timeSliderMax = isSubDay ? timePartitions : maxShiftedDays
  const timeStep = isSubDay ? 1 : 0.25
  const sliderValueToDays = (value: number) => {
    if (!isSubDay || timePartitions === 0) return isSubDay ? 0 : value
    if (value >= timePartitions) return maxShiftedDays
    return (value * maxShiftedDays) / timePartitions
  }
  const formatTime = (value: number) => {
    const totalSeconds = Math.max(0, Math.round(value * 24 * 60 * 60))
    const totalHours = Math.round((totalSeconds / (60 * 60)) * 10) / 10
    if (isSubDay) {
      if (totalSeconds < 60) return `+${totalSeconds}s`
      if (totalSeconds < 60 * 60) {
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return seconds === 0 ? `+${minutes}m` : `+${minutes}m ${seconds}s`
      }
      return `+${totalHours.toLocaleString()}h`
    }
    const wholeDays = Math.floor(totalHours / 24)
    const hours = Math.round((totalHours - wholeDays * 24) * 10) / 10
    if (hours === 0) return `+${wholeDays}d`
    if (wholeDays === 0) return `+${hours.toLocaleString()}h`
    return `+${wholeDays}d ${hours.toLocaleString()}h`
  }
  const isDirty = spotShiftPct !== 0 || ivShiftPct !== 0 || daysElapsed !== 0

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-gradient-to-r from-muted/30 to-transparent px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-warning/15 to-primary/15 text-warning">
            <Sliders className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-none">What-If Simulator</h3>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Stress-test the strategy across spot, IV and time
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={!isDirty}
          className="h-7 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw className="mr-1 size-4" />
          Reset
        </Button>
      </div>
      <div className="space-y-5 px-4 py-4">
        <SliderRow
          icon={<TrendingUp className="size-4" />}
          label="Spot Price"
          accessibleLabel="Spot price shift"
          sublabel="Move underlying up or down"
          value={spotShiftPct}
          min={-10}
          max={10}
          step={0.1}
          accent="pink"
          centered
          formatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
          onChange={onSpotShiftChange}
        />
        <SliderRow
          icon={<Waves className="size-4" />}
          label="Implied Volatility"
          accessibleLabel="Implied volatility shift"
          sublabel="Vol expansion or crush"
          value={ivShiftPct}
          min={-50}
          max={50}
          step={1}
          accent="violet"
          centered
          formatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
          onChange={onIvShiftChange}
        />
        <SliderRow
          icon={<Clock className="size-4" />}
          label={isSubDay ? 'Hours Forward' : 'Days Forward'}
          accessibleLabel="Time forward"
          sublabel="Advance time toward expiry"
          value={timeSliderValue}
          min={0}
          max={timeSliderMax}
          step={timeStep}
          disabled={!hasTimeRemaining}
          accent="blue"
          formatter={(value) => formatTime(sliderValueToDays(value))}
          onChange={(value) => onDaysElapsedChange(sliderValueToDays(value))}
        />
      </div>
    </div>
  )
}
