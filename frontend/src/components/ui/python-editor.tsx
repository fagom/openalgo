import { python } from '@codemirror/lang-python'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { createTheme } from '@uiw/codemirror-themes'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'
import { type ChartPalette, getChartPalette, withAlpha } from '@/lib/chartTheme'
import { useThemeStore } from '@/stores/themeStore'

interface PythonEditorProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  height?: string
}

// Custom Python syntax theme
const createPythonTheme = (isDark: boolean, p: ChartPalette): Extension => {
  return createTheme({
    theme: isDark ? 'dark' : 'light',
    settings: {
      background: 'transparent',
      foreground: p.text,
      caret: p.primary,
      selection: withAlpha(p.primary, 0.22),
      selectionMatch: withAlpha(p.primary, 0.12),
      lineHighlight: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      gutterBackground: 'transparent',
      gutterForeground: p.textMuted,
      gutterBorder: 'transparent',
    },
    styles: [
      // Keywords (def, class, if, else, for, while, import, from, etc.) - purple
      { tag: t.keyword, color: '#c084fc' },
      // Function/method names - sky
      { tag: t.function(t.definition(t.variableName)), color: '#38bdf8' },
      { tag: t.function(t.variableName), color: '#38bdf8' },
      // Class names - yellow
      { tag: t.className, color: '#facc15' },
      { tag: t.definition(t.className), color: '#facc15' },
      // Strings - emerald
      { tag: t.string, color: '#34d399' },
      // Numbers - orange
      { tag: t.number, color: '#fb923c' },
      // Booleans (True, False) - purple
      { tag: t.bool, color: '#c084fc' },
      // None - red
      { tag: t.null, color: '#f87171' },
      // Comments - gray
      { tag: t.comment, color: isDark ? '#6b7280' : '#9ca3af', fontStyle: 'italic' },
      // Operators
      { tag: t.operator, color: isDark ? '#a3a3a3' : '#525252' },
      // Variables
      { tag: t.variableName, color: p.text },
      // Property names (attributes) - sky
      { tag: t.propertyName, color: '#38bdf8' },
      // Decorators - pink
      { tag: t.meta, color: '#f472b6' },
      // Built-in functions - cyan
      { tag: t.standard(t.variableName), color: '#22d3ee' },
      // Brackets and punctuation
      { tag: t.bracket, color: isDark ? '#a3a3a3' : '#525252' },
      { tag: t.punctuation, color: isDark ? '#a3a3a3' : '#525252' },
    ],
  })
}

// Editor base styling
const createBaseTheme = (isDark: boolean, p: ChartPalette): Extension => {
  const borderColor = p.border
  const gutterBg = isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.02)'

  return EditorView.theme({
    '&': {
      fontSize: '13px',
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
      lineHeight: '22px',
      backgroundColor: 'transparent',
    },
    '.cm-line': {
      padding: '0 12px',
    },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      borderRight: `1px solid ${borderColor}`,
      paddingRight: '2px',
    },
    '.cm-gutter': {
      minWidth: '36px',
    },
    '.cm-gutterElement': {
      padding: '0 6px 0 8px',
      lineHeight: '22px',
    },
    '.cm-placeholder': {
      color: 'rgba(128, 128, 128, 0.5)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-cursor': {
      borderLeftColor: p.primary,
      borderLeftWidth: '2px',
    },
  })
}

export function PythonEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  className = '',
  height = '100%',
}: PythonEditorProps) {
  const { mode, appMode } = useThemeStore()
  // Dark mode when: explicit dark theme OR analyzer mode (always dark purple theme)
  const isDark = mode === 'dark' || appMode === 'analyzer'
  const pal = getChartPalette(mode, appMode)

  const extensions = useMemo(() => {
    return [
      python(),
      createPythonTheme(isDark, pal),
      createBaseTheme(isDark, pal),
      EditorView.lineWrapping,
    ]
  }, [isDark, pal])

  return (
    <div className={`h-full w-full ${className}`}>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        readOnly={readOnly}
        placeholder={placeholder}
        height={height}
        theme={isDark ? 'dark' : 'light'}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
          tabSize: 4,
        }}
      />
    </div>
  )
}
