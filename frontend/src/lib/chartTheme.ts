/**
 * Concrete colours for canvas and SVG charts (lightweight-charts, Plotly,
 * Monaco, openalgo-charts), which cannot read CSS custom properties.
 *
 * These are the hex equivalents of the oklch tokens in `src/index.css`. The
 * two lists are kept side by side on purpose: change a token there and change
 * its twin here, or a chart drifts from the page around it.
 */
import type { AppMode, ThemeMode } from '@/stores/themeStore'

export interface ChartPalette {
  isDark: boolean
  isAnalyzer: boolean
  /** Page background behind the chart. */
  background: string
  /** Card / panel surface. */
  surface: string
  /** Coconut-style subtle fill (table headers, bands). */
  muted: string
  text: string
  textMuted: string
  border: string
  grid: string
  crosshair: string
  /** Background of the crosshair's axis label. */
  crosshairLabel: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  tooltipMuted: string
  watermark: string
  primary: string
  /** Rising candle, positive P&L. */
  up: string
  /** Falling candle, negative P&L. */
  down: string
  buy: string
  sell: string
  warning: string
  /** The underlying / spot line, drawn in the text colour so it reads as neutral. */
  spot: string
  /** Five categorical series colours, in order of preference. */
  series: readonly [string, string, string, string, string]
  fontFamily: string
}

export const CHART_FONT =
  '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

const LIGHT: ChartPalette = {
  isDark: false,
  isAnalyzer: false,
  background: '#ffffff',
  surface: '#ffffff',
  muted: '#f7f5f2',
  text: '#1e1919',
  textMuted: '#6f6a64',
  border: '#e0dcd6',
  grid: 'rgba(30, 25, 25, 0.07)',
  crosshair: 'rgba(30, 25, 25, 0.35)',
  crosshairLabel: '#0061fe',
  tooltipBg: 'rgba(255, 255, 255, 0.97)',
  tooltipBorder: '#e0dcd6',
  tooltipText: '#1e1919',
  tooltipMuted: '#6f6a64',
  watermark: 'rgba(30, 25, 25, 0.06)',
  primary: '#0061fe',
  up: '#1b7f45',
  down: '#d0303a',
  buy: '#1b7f45',
  sell: '#d0303a',
  warning: '#9a6a10',
  spot: '#1e1919',
  series: ['#0061fe', '#f2602f', '#2a7a62', '#83306e', '#e8a030'],
  fontFamily: CHART_FONT,
}

const DARK: ChartPalette = {
  isDark: true,
  isAnalyzer: false,
  background: '#1e1919',
  surface: '#262121',
  muted: '#2e2828',
  text: '#f5f3f0',
  textMuted: '#a8a29c',
  border: '#3a3434',
  grid: 'rgba(245, 243, 240, 0.07)',
  crosshair: 'rgba(245, 243, 240, 0.4)',
  crosshairLabel: '#3a3434',
  tooltipBg: 'rgba(38, 33, 33, 0.97)',
  tooltipBorder: '#3a3434',
  tooltipText: '#f5f3f0',
  tooltipMuted: '#a8a29c',
  watermark: 'rgba(245, 243, 240, 0.07)',
  primary: '#5f97f5',
  up: '#5cc98a',
  down: '#ee6e64',
  buy: '#5cc98a',
  sell: '#ee6e64',
  warning: '#f0c060',
  spot: '#f5f3f0',
  series: ['#5f97f5', '#f58055', '#4fb894', '#d98bc4', '#f2c063'],
  fontFamily: CHART_FONT,
}

const ANALYZER: ChartPalette = {
  isDark: true,
  isAnalyzer: true,
  background: '#1f1a2e',
  surface: '#262038',
  muted: '#2e2742',
  text: '#f2effa',
  textMuted: '#b8b0cc',
  border: '#3d3552',
  grid: 'rgba(200, 180, 255, 0.08)',
  crosshair: 'rgba(174, 149, 250, 0.5)',
  crosshairLabel: '#4a3f6b',
  tooltipBg: 'rgba(38, 32, 56, 0.97)',
  tooltipBorder: '#3d3552',
  tooltipText: '#f2effa',
  tooltipMuted: '#b8b0cc',
  watermark: 'rgba(174, 149, 250, 0.1)',
  primary: '#ae95fa',
  up: '#62d197',
  down: '#f07a6e',
  buy: '#62d197',
  sell: '#f07a6e',
  warning: '#f2c867',
  spot: '#f2effa',
  series: ['#ae95fa', '#e88ac4', '#7fa8f0', '#d0b8f5', '#f2c867'],
  fontFamily: CHART_FONT,
}

export function getChartPalette(mode: ThemeMode, appMode: AppMode = 'live'): ChartPalette {
  if (appMode === 'analyzer') return ANALYZER
  return mode === 'dark' ? DARK : LIGHT
}

/** `#rrggbb` plus an alpha, as `rgba()`. Passes any non-hex colour through. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = Number.parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
