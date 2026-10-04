import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useThemeStore } from '@/stores/themeStore'

const Toaster = ({ ...props }: ToasterProps) => {
  const mode = useThemeStore((s) => s.mode)
  const appMode = useThemeStore((s) => s.appMode)
  // Analyzer is a dark palette, whatever the saved light/dark preference.
  const theme: ToasterProps['theme'] = appMode === 'analyzer' ? 'dark' : mode

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      offset="72px"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          fontFamily: 'var(--font-sans)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
