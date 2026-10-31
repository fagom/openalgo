import { json } from '@codemirror/lang-json'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { createTheme } from '@uiw/codemirror-themes'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'
import { type ChartPalette, getChartPalette, withAlpha } from '@/lib/chartTheme'
import { useThemeStore } from '@/stores/themeStore'

interface JsonEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  lineWrapping?: boolean
}

// Custom theme matching the existing tokenizer colors
// Keys: sky-400, Strings: emerald-400, Numbers: orange-400, Booleans: purple-400, Null: red-400
const createJsonTheme = (isDark: boolean, p: ChartPalette): Extension => {
  return createTheme({
    theme: isDark ? 'dark' : 'light',
    settings: {
      background: 'transparent',
      foreground: p.text,
      caret: p.primary,
      selection: withAlpha(p.primary, 0.22),
      selectionMatch: withAlpha(p.primary, 0.12),
      lineHighlight: 'transparent',
      gutterBackground: 'transparent',
      gutterForeground: p.textMuted,
      gutterBorder: 'transparent',
    },
    styles: [
      // Property names (keys) - sky-400
      { tag: t.propertyName, color: '#38bdf8' },
      // Strings - emerald-400
      { tag: t.string, color: '#34d399' },
      // Numbers - orange-400
      { tag: t.number, color: '#fb923c' },
      // Booleans - purple-400
      { tag: t.bool, color: '#c084fc' },
      // Null - red-400
      { tag: t.null, color: '#f87171' },
      // Brackets and punctuation
      { tag: t.bracket, color: isDark ? '#a3a3a3' : '#525252' },
      { tag: t.punctuation, color: isDark ? '#a3a3a3' : '#525252' },
    ],
  })
}

// Editor base styling - uses CSS variables for theme consistency
const createBaseTheme = (isDark: boolean, p: ChartPalette): Extension => {
  const borderColor = p.border
  // Match response panel's bg-card/50 styling
  const gutterBg = isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.02)'

  return EditorView.theme({
    '&': {
      fontSize: '12px',
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      height: '100%',
      backgroundColor: 'transparent',
    },
    '&.cm-editor': {
      height: '100%',
      backgroundColor: 'transparent',
    },
    '.cm-scroller': {
      overflow: 'auto',
      height: '100%',
      backgroundColor: 'transparent',
    },
    '.cm-content': {
      padding: '12px 0',
      lineHeight: '20px',
      backgroundColor: 'transparent',
    },
    '.cm-line': {
      padding: '0 12px',
    },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      borderRight: `1px solid ${borderColor}`,
      paddingRight: '4px',
    },
    '.cm-gutter': {
      minWidth: '40px',
    },
    '.cm-gutterElement': {
      padding: '0 8px 0 12px',
      lineHeight: '20px',
    },
    '.cm-placeholder': {
      color: 'rgba(128, 128, 128, 0.5)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
    },
  })
}

export function JsonEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  className = '',
  lineWrapping = true,
}: JsonEditorProps) {
  const { mode, appMode } = useThemeStore()
  // Dark mode when: explicit dark theme OR analyzer mode (always dark purple theme)
  const isDark = mode === 'dark' || appMode === 'analyzer'
  const pal = getChartPalette(mode, appMode)

  const extensions = useMemo(() => {
    const exts = [json(), createJsonTheme(isDark, pal), createBaseTheme(isDark, pal)]
    if (lineWrapping) {
      exts.push(EditorView.lineWrapping)
    }
    return exts
  }, [isDark, pal, lineWrapping])

  return (
    <div className={`h-full w-full ${className}`}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        placeholder={placeholder}
        height="100%"
        theme={isDark ? 'dark' : 'light'}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: false,
          highlightActiveLine: false,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
          tabSize: 2,
        }}
      />
    </div>
  )
}
