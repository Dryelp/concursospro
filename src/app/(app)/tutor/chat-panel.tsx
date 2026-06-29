'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Bot, BrainCircuit } from 'lucide-react'

import { ChatForm } from '@/app/(app)/tutor/chat-form'
import type { ChatMessage } from '@/lib/database.types'

const thinkingSteps = [
  'Cruzando seu desempenho recente...',
  'Lendo erros, revisoes e flashcards pendentes...',
  'Separando os pontos que mais podem virar nota...',
  'Montando uma orientacao objetiva...',
]

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
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingStep, setThinkingStep] = useState(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, isThinking, thinkingStep])

  useEffect(() => {
    if (!isThinking) {
      setThinkingStep(0)
      return
    }

    const interval = window.setInterval(() => {
      setThinkingStep((current) => (current + 1) % thinkingSteps.length)
    }, 1800)

    return () => window.clearInterval(interval)
  }, [isThinking])

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
          {isThinking ? (
            <div className="max-w-[86%] self-start rounded-2xl rounded-bl-sm border border-atlas-400/20 bg-[linear-gradient(135deg,rgba(79,142,247,.12),rgba(15,23,42,.78))] p-4 text-sm leading-6 text-slate-200 shadow-[0_18px_60px_rgba(0,0,0,.22)]">
              <div className="mb-3 flex items-center gap-3">
                <div className="relative flex size-10 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400">
                  <span className="absolute inset-0 animate-ping rounded-xl bg-atlas-400/15" />
                  <BrainCircuit className="relative size-5" />
                </div>
                <div>
                  <p className="font-display text-sm font-bold text-white">
                    Professor Atlas esta pensando
                    <span className="atlas-thinking-dots" aria-hidden="true">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Usando o contexto real do seu concurso.
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-950/35">
                {thinkingSteps.map((step, index) => (
                  <div
                    key={step}
                    className={`flex items-center gap-2 px-3 py-2 text-xs transition ${
                      index === thinkingStep
                        ? 'text-slate-100'
                        : 'text-slate-600'
                    }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${
                        index === thinkingStep
                          ? 'bg-atlas-400 shadow-[0_0_12px_rgba(79,142,247,.85)]'
                          : 'bg-white/10'
                      }`}
                    />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatForm projectId={projectId} onPendingChange={setIsThinking} />
    </div>
  )
}
