import { Suspense, lazy } from 'react'
import { Textarea } from '@/components/ui/textarea'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

export function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
  bundleNames?: Array<{ name: string; content: string }>
}) {
  return (
    <Suspense
      fallback={
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="font-mono text-base min-h-[200px]"
          rows={8}
        />
      }
    >
      <PromptEditor {...props} />
    </Suspense>
  )
}
