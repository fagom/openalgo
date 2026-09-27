import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-[18px] shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive',
        outline:
          'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-foreground text-background hover:bg-foreground/85',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3.5',
        sm: 'h-9 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-12 px-6 text-base has-[>svg]:px-5',
        icon: "size-10 [&_svg:not([class*='size-'])]:size-5",
        'icon-sm': "size-9 [&_svg:not([class*='size-'])]:size-5",
        'icon-lg': "size-11 [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * Plain-text label shown in a tooltip on hover and keyboard focus. An
     * icon-only button falls back to its aria-label, then its title, so every
     * one of them explains itself without a second wrapper at the call site.
     */
    tooltip?: React.ReactNode
    tooltipSide?: React.ComponentProps<typeof TooltipContent>['side']
  }

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  tooltip,
  tooltipSide,
  title,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const isIconOnly = typeof size === 'string' && size.startsWith('icon')
  const label = tooltip ?? (isIconOnly ? (props['aria-label'] ?? title) : undefined)
  const ariaLabel =
    props['aria-label'] ??
    (isIconOnly && typeof label === 'string' ? label : undefined) ??
    (isIconOnly ? title : undefined)

  const button = (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      // The tooltip replaces the native title, which is slow, unstyled and
      // never shown on touch. A button without a tooltip keeps its title.
      title={label ? undefined : title}
      {...props}
      aria-label={ariaLabel}
    />
  )

  if (!label) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  )
}

export { Button, buttonVariants }
