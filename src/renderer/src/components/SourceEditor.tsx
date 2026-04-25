import { useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'

type SourceEditorProps = {
  content: string
  onChange: (value: string) => void
  onSave: () => void
  onEscape: () => void
}

export default function SourceEditor({ content, onChange, onSave, onEscape }: SourceEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current()
              return true
            }
          },
          {
            key: 'Escape',
            run: () => {
              onEscapeRef.current()
              return true
            }
          }
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflowY: 'auto', overflowX: 'hidden' },
          '.cm-content': {
            fontFamily: "'Maple Mono NF CN', 'SF Mono', 'Consolas', 'Liberation Mono', monospace",
            fontSize: '15px',
            lineHeight: '1.6',
            maxWidth: '860px',
            margin: '0 auto',
            padding: '32px 24px'
          }
        })
      ]
    })

    const view = new EditorView({
      state,
      parent: containerRef.current
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewRef.current && viewRef.current.state.doc.toString() !== content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: content
        }
      })
    }
  }, [content])

  return <div ref={containerRef} className="source-editor" />
}
