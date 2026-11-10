# 49 - Themes And App Mode

## State

`frontend/src/stores/themeStore.ts` is a persisted Zustand store with two related values:

| Value | Options | Purpose |
|---|---|---|
| `mode` | `light`, `dark` | User preference in live mode |
| `appMode` | `live`, `analyzer` | Backend trading mode reflected in UI |

The store persists under `openalgo-theme`. Rehydration applies the `.dark` or `.analyzer` class to the document root and removes any `data-theme` attribute an older build left behind (accent presets were removed; a stale `color` key in storage is ignored).

## Mode Rules

Live mode permits light/dark changes. Analyzer mode applies its dedicated violet palette and suppresses light/dark changes until the app returns to live mode. Backend mode is synchronized from `/auth/analyzer-mode`; toggles use a CSRF token and `/auth/analyzer-toggle`.

Mode-change listeners allow data-heavy pages to refetch or reset state when moving between live and analyzer sources.

## Design Language

One palette, modelled on Dropbox's product UI:

| Token | Light | Dark |
|---|---|---|
| background | white | graphite `#1E1919` |
| muted / secondary surfaces | coconut `#F7F5F2` | `#2E2828` |
| foreground | graphite `#1E1919` | `#F7F5F2` |
| primary / ring | Dropbox blue `#0061FE` | lifted blue, graphite label |
| border | warm hairline `#DEDAD4` | `#3A3434` |

Analyzer is a violet-tinted graphite with a violet primary, deliberately unlike either live mode, plus a violet rule along the top of the navbar.

Type is Inter Variable for UI text and Inter Tight Variable for headings, both self-hosted through `@fontsource-variable/*` so offline installs and `CSP_FONT_SRC='self'` keep working. Radius is 8px; surfaces are flat and border-first, with shadows only on popovers and dialogs. Icons are at least 16px inline, 18px in labelled buttons and 20px in icon-only buttons.

## CSS

`frontend/src/index.css` defines every token once, as a complete `oklch()` colour, for `:root`, `.dark` and `.analyzer`. Tokens are always used as `var(--x)`, never wrapped in `hsl()`. The `dark:` Tailwind variant also applies under `.analyzer`, because analyzer is a dark palette.

Besides the shadcn tokens there are semantic trading tokens: `profit`, `loss`, `buy`, `sell`, `success`, `warning`, `info` (each with `-foreground`), plus `overlay` and `tooltip`. **Pages colour through tokens only.** A Tailwind palette class such as `text-green-600` does not follow light, dark or analyzer mode; use `text-profit`, `bg-warning/10` and so on instead.

Canvas and SVG charts cannot read CSS variables. `frontend/src/lib/chartTheme.ts` holds the hex twins of the tokens (`getChartPalette(mode, appMode)`); change a token and its twin together. The `/trading` terminal instead rasterizes the live tokens in `lib/trading/chartTheme.ts`.

## Controls

Theme and app-mode controls are rendered by `frontend/src/components/layout/Navbar.tsx`. Every icon-only control has a tooltip: `Button` shows its `tooltip` prop, or for an `icon` size falls back to `aria-label` then `title`, and drops the native `title`.

## Invariants

- Persist visual state across logout for continuity, but resynchronize trading app mode after authentication.
- Never let a client-only colour choice change backend analyzer/live behavior.
- Analyzer/live toggle failures must leave the last confirmed app mode intact.
- Analyzer must never look like live.

## Key Files

| File | Purpose |
|---|---|
| `frontend/src/stores/themeStore.ts` | Persisted state and backend mode sync |
| `frontend/src/components/layout/Navbar.tsx` | User controls |
| `frontend/src/index.css` | Tokens for light, dark and analyzer |
| `frontend/src/lib/chartTheme.ts` | Chart palette twins of the tokens |
| `frontend/src/components/ui/button.tsx` | Button variants and built-in tooltip |
