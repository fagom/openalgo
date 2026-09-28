import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, userEvent } from '@/test/test-utils'
import { Button } from './button'

expect.extend(toHaveNoViolations)

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    expect(button).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={handleClick}>Click me</Button>)

    const button = screen.getByRole('button', { name: /click me/i })
    await user.click(button)

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Button variant="default">Default</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'default')
    })

    it('renders destructive variant', () => {
      render(<Button variant="destructive">Delete</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'destructive')
    })

    it('renders outline variant', () => {
      render(<Button variant="outline">Outline</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'outline')
    })

    it('renders secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'secondary')
    })

    it('renders ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'ghost')
    })

    it('renders link variant', () => {
      render(<Button variant="link">Link</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-variant', 'link')
    })
  })

  describe('sizes', () => {
    it('renders default size', () => {
      render(<Button size="default">Default</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'default')
    })

    it('renders small size', () => {
      render(<Button size="sm">Small</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'sm')
    })

    it('renders large size', () => {
      render(<Button size="lg">Large</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'lg')
    })

    it('renders icon size', () => {
      render(<Button size="icon">Icon</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('data-size', 'icon')
    })
  })

  describe('disabled state', () => {
    it('renders disabled button', () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('does not call onClick when disabled', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      )

      const button = screen.getByRole('button')
      await user.click(button)

      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('asChild', () => {
    it('renders as child element when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      )

      const link = screen.getByRole('link', { name: /link button/i })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', '/test')
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations with default props', async () => {
      const { container } = render(<Button>Click me</Button>)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations when disabled', async () => {
      const { container } = render(<Button disabled>Disabled</Button>)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with icon-only button when aria-label is provided', async () => {
      const { container } = render(
        <Button size="icon" aria-label="Close dialog">
          X
        </Button>
      )

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('is focusable', () => {
      render(<Button>Focus me</Button>)

      const button = screen.getByRole('button')
      button.focus()

      expect(document.activeElement).toBe(button)
    })

    it('supports aria attributes', () => {
      render(
        <Button aria-expanded="true" aria-haspopup="menu">
          Menu
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-expanded', 'true')
      expect(button).toHaveAttribute('aria-haspopup', 'menu')
    })
  })

  describe('tooltip', () => {
    it('shows the tooltip prop on keyboard focus and names the icon button', async () => {
      const user = userEvent.setup()
      render(
        <Button size="icon" tooltip="Refresh positions">
          <svg />
        </Button>
      )

      const button = screen.getByRole('button', { name: 'Refresh positions' })
      await user.tab()
      expect(document.activeElement).toBe(button)
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Refresh positions')
    })

    it('falls back to aria-label on an icon-only button', async () => {
      const user = userEvent.setup()
      render(
        <Button size="icon" aria-label="Close all positions">
          <svg />
        </Button>
      )

      await user.tab()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Close all positions')
    })

    it('prefers the fuller title over the aria-label for the tooltip text', async () => {
      const user = userEvent.setup()
      render(
        <Button size="icon" aria-label="Undo drawing" title="Undo drawing (Ctrl + Z)">
          <svg />
        </Button>
      )

      await user.tab()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Undo drawing (Ctrl + Z)')
      // The accessible name stays the short one.
      expect(screen.getByRole('button', { name: 'Undo drawing' })).toBeInTheDocument()
    })

    it('replaces the native title with the tooltip', () => {
      render(
        <Button size="icon" title="Copy API key">
          <svg />
        </Button>
      )

      const button = screen.getByRole('button', { name: 'Copy API key' })
      expect(button).not.toHaveAttribute('title')
    })

    it('adds no tooltip to a labelled text button', () => {
      render(<Button title="Save now">Save</Button>)

      const button = screen.getByRole('button', { name: 'Save' })
      expect(button).toHaveAttribute('title', 'Save now')
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })
})
