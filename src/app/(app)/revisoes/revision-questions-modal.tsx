'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Brain, CheckCircle2, FileQuestion, LoaderCircle, X, XCircle } from 'lucide-react'

import { startRevisionQuestionsAction, type RevisionQuestionsState } from '@/app/(app)/revisoes/actions'
import { answerQuestionAction } from '@/app/(app)/simulados/actions'
import type { MockQuestion } from '@/lib/database.types'
import { renderMarkedText } from '@/lib/question-text'

type Alternative = { letter: string; text: string }
type LocalAnswer = { selectedAnswer: string; correct: boolean }

const initialState: RevisionQuestionsState = {}

function LoadButton() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary w-full justify-center" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <FileQuestion className="size-4" />}
      {pending ? 'Preparando questões...' : 'Começar 3 questões'}
    </button>
  )
}

function MarkedText({ value }: { value: string }) {
  return (
    <>
      {renderMarkedText(value).map((part) =>
        part.highlighted ? (
          <strong
            key={part.key}
            className="rounded-md bg-atlas-yellow/20 px-1 font-extrabold text-atlas-yellow"
          >
            {part.text}
          </strong>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function RevisionQuestionsModal({
  projectId,
  reviewId,
  subjectId,
  subjectName,
  topic,
}: {
  projectId: string
  reviewId: string
  subjectId: string | null
  subjectName: string
  topic: string
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({})
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, boolean>>({})
  const [state, formAction] = useFormState(startRevisionQuestionsAction, initialState)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const [, startTransition] = useTransition()

  const questions = state.questions ?? []
  const question = questions[index] ?? null
  const answeredCount = questions.filter((item) => answers[item.id]).length

  useEffect(() => {
    if (!open) return

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function answer(questionToAnswer: MockQuestion, selectedAnswer: string) {
    const correct = selectedAnswer === questionToAnswer.correct_answer
    setAnswers((current) => ({
      ...current,
      [questionToAnswer.id]: { selectedAnswer, correct },
    }))
    setPendingAnswers((current) => ({ ...current, [questionToAnswer.id]: true }))

    const formData = new FormData()
    formData.set('questionId', questionToAnswer.id)
    formData.set('selectedAnswer', selectedAnswer)

    startTransition(async () => {
      try {
        await answerQuestionAction(formData)
      } finally {
        setPendingAnswers((current) => ({ ...current, [questionToAnswer.id]: false }))
      }
    })
  }

  if (!subjectId) {
    return (
      <button className="button-secondary justify-center opacity-50" disabled>
        <FileQuestion className="size-4" />
        Questões indisponíveis
      </button>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="button-secondary justify-center"
        type="button"
        onClick={() => setOpen(true)}
      >
        <FileQuestion className="size-4" />
        Resolver 3 questões
      </button>

      {open ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`revision-questions-${reviewId}`}
            className="max-h-[94vh] w-full max-w-[760px] overflow-y-auto rounded-[26px] border border-white/[0.12] bg-ink-900 p-5 shadow-panel"
          >
            <header className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="dashboard-eyebrow">Mini-simulado de revisão</p>
                <h2 id={`revision-questions-${reviewId}`} className="mt-1 break-words font-display text-xl font-extrabold text-white">
                  {subjectName}
                </h2>
                <p className="mt-1 break-words text-sm leading-5 text-slate-500">{topic}</p>
              </div>
              <button
                className="rounded-lg p-2 text-slate-500 transition hover:bg-ink-850 hover:text-slate-200"
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  setOpen(false)
                  window.setTimeout(() => triggerRef.current?.focus(), 0)
                }}
              >
                <X className="size-4" />
              </button>
            </header>

            {!questions.length ? (
              <form action={formAction} className="rounded-[22px] border border-white/10 bg-ink-950/40 p-5">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="reviewId" value={reviewId} />
                <input type="hidden" name="subjectId" value={subjectId} />
                <input type="hidden" name="topic" value={topic} />
                <p className="mb-4 text-sm leading-6 text-slate-400">
                  Vamos resolver 3 questões curtas deste tópico sem sair da revisão. Se já houver questões pendentes, eu reaproveito antes de gastar IA.
                </p>
                <LoadButton />
                {state.error ? <p className="mt-3 text-sm text-atlas-red">{state.error}</p> : null}
              </form>
            ) : null}

            {question ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <span className="text-xs font-bold text-slate-400">
                    Questão {index + 1} de {questions.length}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {answeredCount}/{questions.length} respondidas
                  </span>
                </div>

                <article className="rounded-[22px] border border-white/10 bg-ink-950/45 p-5">
                  <p className="break-words text-sm font-semibold leading-6 text-slate-100">
                    <MarkedText value={question.statement} />
                  </p>

                  <div className="mt-5 space-y-2">
                    {(Array.isArray(question.alternatives) ? question.alternatives as Alternative[] : []).map((alternative) => {
                      const localAnswer = answers[question.id]
                      const selected = localAnswer?.selectedAnswer === alternative.letter
                      const correct = question.correct_answer === alternative.letter
                      const answered = Boolean(localAnswer)
                      const tone = answered
                        ? correct
                          ? 'border-atlas-green bg-atlas-green/10 text-atlas-green'
                          : selected
                            ? 'border-atlas-red bg-atlas-red/10 text-atlas-red'
                            : 'border-white/10 opacity-55'
                        : 'border-white/10 hover:border-atlas-400 hover:bg-atlas-400/5'

                      return (
                        <button
                          key={alternative.letter}
                          className={`flex w-full min-w-0 items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${tone}`}
                          disabled={answered}
                          type="button"
                          onClick={() => answer(question, alternative.letter)}
                        >
                          <strong className="shrink-0">{alternative.letter}</strong>
                          <span className="min-w-0 break-words">
                            <MarkedText value={alternative.text} />
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {answers[question.id] ? (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-2 flex items-center gap-2 font-bold text-white">
                        {answers[question.id].correct ? (
                          <CheckCircle2 className="size-4 text-atlas-green" />
                        ) : (
                          <XCircle className="size-4 text-atlas-red" />
                        )}
                        {answers[question.id].correct ? 'Acertou' : `Errou · gabarito ${question.correct_answer}`}
                        {pendingAnswers[question.id] ? <LoaderCircle className="size-3.5 animate-spin text-slate-500" /> : null}
                      </div>
                      <p className="break-words text-sm leading-6 text-slate-400">
                        <MarkedText value={question.explanation ?? ''} />
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-atlas-400/15 bg-atlas-400/[0.055] p-4 text-sm leading-6 text-slate-400">
                      <div className="mb-1 flex items-center gap-2 font-bold text-white">
                        <Brain className="size-4 text-atlas-400" />
                        Atlas
                      </div>
                      Responda antes de olhar a explicação. O objetivo aqui é testar retenção, não estudar passivamente.
                    </div>
                  )}
                </article>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <button
                    className="button-secondary justify-center"
                    type="button"
                    disabled={index === 0}
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                  >
                    Anterior
                  </button>
                  <button
                    className="button-primary justify-center"
                    type="button"
                    disabled={index >= questions.length - 1}
                    onClick={() => setIndex((current) => Math.min(questions.length - 1, current + 1))}
                  >
                    Próxima questão
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
