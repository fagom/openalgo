/**
 * The shared vocabulary of the terminal's two edge rails.
 *
 * DrawingRail sits on the left and RightRail on the right, and they are on
 * screen together. Two independent copies of "what a rail button looks like"
 * would survive exactly until the first restyle, after which the two edges of
 * the same workspace would quietly disagree. The metrics live here once.
 */

import type * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** A rail button at rest: 36px square, quiet until hovered. */
export const RAIL_BTN =
  'flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'

/**
 * Layered onto RAIL_BTN when the tool is armed or the panel is open.
 *
 * Reported as not differentiated at all. It was applied correctly, but a 15%
 * tint of the accent behind a muted glyph is a shade of grey on a dark ground:
 * the armed tool and the ten resting ones beside it read the same at a glance,
 * which is the only distance this ever gets looked at. A quarter-strength fill,
 * a solid-enough border and the accent on the glyph itself carry it, and the
 * glyphs already stroke with currentColor so the last one costs nothing.
 */
export const RAIL_BTN_ON =
  'border-primary/70 bg-primary/25 text-primary hover:bg-primary/30 hover:text-primary'

/**
 * The stroke weight for a lucide glyph in a rail.
 *
 * DrawingRail's tool icons come from `drawTools`, which already draws at 1.5,
 * so lucide's default of 2 in the right rail put two different stroke weights
 * in identical boxes on the same screen. DrawingRail's own hand-written
 * undo, redo and delete SVGs sit at 1.6 and are not covered by this.
 */
export const RAIL_ICON_STROKE = 1.5

/** Glyph box inside a rail button. 20px: 18px read as too small beside the 20px navbar icons. */
export const RAIL_ICON = 'h-5 w-5'

/** Width of a rail: a 36px button plus a 6px gutter each side. */
export const RAIL_WIDTH = 'w-12'

/**
 * Hover label beside a rail button.
 *
 * The native `title` attribute waits about a second and cannot be styled; a
 * rail of identical glyphs needs its names to appear immediately.
 *
 * Positioned `fixed` from the button's own rectangle, and that is the whole
 * point. The rails scroll vertically, and a scrolling box clips horizontally as
 * well, so a tip positioned `absolute` beside a 40px rail was cut off at the
 * rail's edge: every rail tip in the terminal existed and none could be seen.
 * A fixed element escapes that clip while staying inside the rail's DOM, so it
 * still paints when a pane is in the Fullscreen top layer, which a portal to
 * the body would not.
 *
 * Shown on hover and on keyboard focus of the wrapping `.group`. `side` is which
 * way it opens; the right rail opens left or the viewport edge clips it.
 */
export function RailTip({
  text,
  chord,
  side = 'right',
}: {
  text: string
  chord?: string
  side?: 'left' | 'right' | 'top' | 'bottom'
}) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const [pos, setPos] = useState<React.CSSProperties | null>(null)

  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host) return
    const show = () => {
      const r = host.getBoundingClientRect()
      const midY = r.top + r.height / 2
      const midX = r.left + r.width / 2
      setPos(
        side === 'right'
          ? { top: midY, left: r.right + 8, transform: 'translateY(-50%)' }
          : side === 'left'
            ? { top: midY, right: window.innerWidth - r.left + 8, transform: 'translateY(-50%)' }
            : side === 'bottom'
              ? { top: r.bottom + 8, left: midX, transform: 'translateX(-50%)' }
              : {
                  bottom: window.innerHeight - r.top + 8,
                  left: midX,
                  transform: 'translateX(-50%)',
                }
      )
    }
    const hide = () => setPos(null)
    host.addEventListener('mouseenter', show)
    host.addEventListener('mouseleave', hide)
    host.addEventListener('focusin', show)
    host.addEventListener('focusout', hide)
    // A click that opens a panel or arms a tool is the answer; the name has done its job.
    host.addEventListener('pointerdown', hide)
    return () => {
      host.removeEventListener('mouseenter', show)
      host.removeEventListener('mouseleave', hide)
      host.removeEventListener('focusin', show)
      host.removeEventListener('focusout', hide)
      host.removeEventListener('pointerdown', hide)
    }
  }, [side])

  return (
    <span
      ref={ref}
      role="tooltip"
      style={pos ?? undefined}
      className={cn(
        'pointer-events-none fixed z-50 whitespace-nowrap rounded-md bg-tooltip px-2.5 py-1.5 text-xs font-medium text-tooltip-foreground shadow-md transition-opacity duration-75',
        pos ? 'opacity-100' : 'invisible opacity-0'
      )}
    >
      {text}
      {chord && <span className="ml-2 opacity-60">{chord}</span>}
    </span>
  )
}
