'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { LoaderCircle, Send } from 'lucide-react'

import {
  sendTutorMessageAction,
  type TutorState,
} from '@/app/(app)/tutor/actions'

function Button() {
  const { pending } = useFormStatus()

  return (
    <button
      className="button-primary h-12 px-4"
      disabled={pending}
      aria-label="Enviar mensagem"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Send className="size-4" />
      )}
    </button>
  )
}

export function ChatForm({ projectId }: { projectId: string }) {
  const [state, action] = useFormState<TutorState, FormData>(
    sendTutorMessageAction,
    {},
  )
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!state?.error) {
      formRef.current?.reset()
      inputRef.current?.focus()
    }
  }, [state])

  return (
    <form
      ref={formRef}
      action={action}
      className="shrink-0 border-t border-white/[0.07] bg-ink-900/95 p-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          name="message"
          className="field min-h-12 resize-none rounded-2xl"
          rows={1}
          placeholder="Pergunte ao Professor Atlas..."
          required
        />
        <Button />
      </div>
      <div aria-live="polite">
        {state?.error ? (
          <p className="mt-2 text-sm text-atlas-red">{state.error}</p>
        ) : null}
      </div>
    </form>
  )
}
