import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RAIL_BTN, RailTip } from './railStyles'

function Rail({ side }: { side?: 'left' | 'right' | 'top' | 'bottom' }) {
  return (
    // The rail scrolls, which is what used to clip an absolutely placed tip.
    <div style={{ width: 40, overflowY: 'auto' }}>
      <div className="group relative" data-testid="host">
        <button type="button" aria-label="Lines" className={RAIL_BTN}>
          <svg />
        </button>
        <RailTip text="Lines" chord="Alt+T" side={side} />
      </div>
    </div>
  )
}

describe('RailTip', () => {
  it('is hidden until its button is hovered, then shown fixed so a scrolling rail cannot clip it', () => {
    render(<Rail />)
    const tip = screen.getByRole('tooltip', { hidden: true })
    expect(tip).toHaveClass('invisible')
    expect(tip).toHaveClass('fixed')

    fireEvent.mouseEnter(screen.getByTestId('host'))
    expect(tip).not.toHaveClass('invisible')
    expect(tip).toHaveTextContent('LinesAlt+T')

    fireEvent.mouseLeave(screen.getByTestId('host'))
    expect(tip).toHaveClass('invisible')
  })

  it('shows on keyboard focus, not only on hover', () => {
    render(<Rail side="bottom" />)
    const tip = screen.getByRole('tooltip', { hidden: true })
    fireEvent.focusIn(screen.getByRole('button', { name: 'Lines' }))
    expect(tip).not.toHaveClass('invisible')
  })

  it('gets out of the way once the button is pressed', () => {
    render(<Rail />)
    const host = screen.getByTestId('host')
    const tip = screen.getByRole('tooltip', { hidden: true })
    fireEvent.mouseEnter(host)
    fireEvent.pointerDown(host)
    expect(tip).toHaveClass('invisible')
  })
})
