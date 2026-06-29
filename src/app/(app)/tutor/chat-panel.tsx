'use client'

import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Bot } from 'lucide-react'

import { ChatForm } from '@/app/(app)/tutor/chat-form'
import type { ChatMessage } from '@/lib/database.types'

export function ChatPanel({
  messages,
  projectId,
  projectTitle,
}: {
  messages: ChatMessage[]
  projectId: string
  projectTitle: string
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  return (
    <div className="panel flex h-[calc(100vh-115px)] min-h-[620px] flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold">Professor Atlas</h2>
            <p className="truncate text-xs text-slate-500">
              Tutor contextualizado em {projectTitle}
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex min-h-full flex-col justify-end gap-3">
          {!messages.length ? (
            <div className="max-w-[82%] rounded-2xl rounded-bl-sm border border-white/[0.07] bg-ink-850 p-4 text-sm leading-6">
              Ola. Posso explicar materias, criar analogias, sugerir estrategias
              e comentar questoes com base no seu concurso.
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl p-4 text-sm leading-6 ${
                  message.role === 'user'
                    ? 'self-end rounded-br-sm bg-gradient-to-br from-atlas-400 to-atlas-violet text-white'
                    : 'self-start rounded-bl-sm border border-white/[0.07] bg-ink-850 text-slate-200'
                }`}
              >
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatForm projectId={projectId} />
    </div>
  )
}
