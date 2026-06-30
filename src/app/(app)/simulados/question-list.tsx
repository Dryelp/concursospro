'use client'

import { useState, useTransition } from 'react'
import { Brain, CheckCircle2, CircleHelp, Lightbulb, XCircle } from 'lucide-react'

import { answerQuestionAction } from '@/app/(app)/simulados/actions'
import type { MockQuestion } from '@/lib/database.types'
import {
  hasHighlightMarkup,
  questionHasRequiredHighlight,
  renderMarkedText,
  requiresHighlight,
} from '@/lib/question-text'

type Alternative = { letter: string; text: string }
type LocalAnswer = { selectedAnswer: string; answeredAt: string }

type QuestionListProps = {
  questions: MockQuestion[]
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
}

function formatAnsweredAt(value: string | null) {
  if (!value) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
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

function atlasHint(question: MockQuestion, answered: boolean, selectedAnswer: string | null) {
  const statementNeedsHighlight = requiresHighlight(question.statement)
  const highlightIsVisible = hasHighlightMarkup(question.statement)
  const topic = question.topic ?? 'este topico'

  if (!answered) {
    if (statementNeedsHighlight) {
      return highlightIsVisible
        ? 'Leia primeiro o termo destacado. A funcao dele na frase costuma entregar o caminho da alternativa.'
        : 'Esta questao depende de uma palavra destacada, mas ela nao veio marcada. Se ficar ambigua, gere outra bateria deste topico.'
    }

    return `Resolva pelo conceito central de ${topic}. Antes de marcar, tente eliminar uma alternativa claramente incompatível.`
  }

  if (selectedAnswer === question.correct_answer) {
    return 'Boa. Agora confira a explicacao e veja se voce acertou pelo fundamento ou por intuicao.'
  }

  return `Voce marcou ${selectedAnswer ?? '-'}, mas o gabarito e ${question.correct_answer}. Compare sua alternativa com a explicacao e procure a pegadinha que mudou o sentido.`
}

function AtlasQuestionHelp({
  question,
  answered,
  selectedAnswer,
}: {
  question: MockQuestion
  answered: boolean
  selectedAnswer: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4">
      <button
        className="inline-flex items-center gap-2 rounded-full border border-atlas-400/20 bg-atlas-400/10 px-3 py-2 text-xs font-bold text-atlas-400 transition hover:border-atlas-400/50 hover:bg-atlas-400/15"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Brain className="size-3.5" />
        {answered ? 'Entender com Atlas' : 'Dica do Atlas'}
      </button>

      {open ? (
        <div className="mt-3 rounded-2xl border border-atlas-400/15 bg-atlas-400/[0.055] p-4 text-sm leading-6 text-slate-300">
          <div className="mb-2 flex items-center gap-2 font-bold text-white">
            <Lightbulb className="size-4 text-atlas-yellow" />
            Prof. Atlas
          </div>
          <p>{atlasHint(question, answered, selectedAnswer)}</p>
          {answered && question.explanation ? (
            <p className="mt-3 border-t border-white/10 pt-3 text-slate-400">
              <MarkedText value={question.explanation} />
            </p>
          ) : null}
          {answered ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Proximo passo: se errou, gere 3 flashcards ou uma nova bateria exatamente sobre este topico.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function QuestionList({
  questions,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: QuestionListProps) {
  const [localAnswers, setLocalAnswers] = useState<Record<string, LocalAnswer>>({})
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  function answer(question: MockQuestion, selectedAnswer: string) {
    const now = new Date().toISOString()
    setLocalAnswers((current) => ({
      ...current,
      [question.id]: { selectedAnswer, answeredAt: now },
    }))
    setPendingAnswers((current) => ({ ...current, [question.id]: true }))

    const formData = new FormData()
    formData.set('questionId', question.id)
    formData.set('selectedAnswer', selectedAnswer)

    startTransition(async () => {
      try {
        await answerQuestionAction(formData)
      } finally {
        setPendingAnswers((current) => ({ ...current, [question.id]: false }))
      }
    })
  }

  return (
    <section className="dashboard-panel">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="dashboard-eyebrow">Questões pendentes</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="dashboard-chip">
          <CircleHelp className="size-3.5" />
          {questions.length} {questions.length === 1 ? 'questão' : 'questões'}
        </span>
      </div>

      {questions.length ? (
        <div className="space-y-4">
          {questions.map((question, index) => {
            const alternatives = Array.isArray(question.alternatives)
              ? question.alternatives as Alternative[]
              : []
            const localAnswer = localAnswers[question.id]
            const selectedAnswer = localAnswer?.selectedAnswer ?? question.selected_answer
            const answered = Boolean(question.answered_at || localAnswer)
            const answeredAt = localAnswer?.answeredAt ?? question.answered_at
            const isCorrect = selectedAnswer === question.correct_answer
            const isSaving = pendingAnswers[question.id]
            const hasMissingHighlight = !questionHasRequiredHighlight({
              statement: question.statement,
              alternatives,
            })

            return (
              <article key={question.id} className="rounded-[22px] border border-white/10 bg-ink-900/60 p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-atlas-400/10 px-3 py-1 text-xs font-bold text-atlas-400">
                    Questão {index + 1}
                  </span>
                  {question.topic ? (
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-400">
                      {question.topic}
                    </span>
                  ) : null}
                  {answered ? (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${isCorrect ? 'bg-atlas-green/10 text-atlas-green' : 'bg-atlas-red/10 text-atlas-red'}`}>
                      {isCorrect ? 'Acertou' : 'Errou'}
                    </span>
                  ) : null}
                  {answeredAt ? (
                    <span className="text-xs font-semibold text-slate-600">
                      {isSaving ? 'Salvando resposta...' : `Resolvida em ${formatAnsweredAt(answeredAt)}`}
                    </span>
                  ) : null}
                </div>

                <p className="mb-4 text-sm font-semibold leading-6 text-slate-100">
                  <MarkedText value={question.statement} />
                </p>

                {hasMissingHighlight ? (
                  <div className="mb-4 rounded-xl border border-atlas-yellow/20 bg-atlas-yellow/10 px-3 py-2 text-xs font-semibold leading-5 text-atlas-yellow">
                    Esta questao menciona termo destacado, mas a IA nao marcou o trecho. Gere novamente se a resposta depender disso.
                  </div>
                ) : null}

                <div className="space-y-2">
                  {alternatives.map((alternative) => {
                    const selected = selectedAnswer === alternative.letter
                    const correct = question.correct_answer === alternative.letter
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
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition ${tone}`}
                        disabled={answered}
                        type="button"
                        onClick={() => answer(question, alternative.letter)}
                      >
                        <strong>{alternative.letter}</strong>
                        <span>
                          <MarkedText value={alternative.text} />
                        </span>
                      </button>
                    )
                  })}
                </div>

                <AtlasQuestionHelp
                  question={question}
                  answered={answered}
                  selectedAnswer={selectedAnswer}
                />

                {answered ? (
                  <div className="mt-4 rounded-xl bg-ink-850 p-4 text-sm leading-6 text-slate-300">
                    <div className="mb-2 flex items-center gap-2 font-bold text-white">
                      {isCorrect ? (
                        <CheckCircle2 className="size-4 text-atlas-green" />
                      ) : (
                        <XCircle className="size-4 text-atlas-red" />
                      )}
                      {isCorrect
                        ? 'Resposta correta'
                        : `Resposta correta: ${question.correct_answer}`}
                    </div>
                    <MarkedText value={question.explanation ?? ''} />
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-white/10 bg-ink-900/40 p-8 text-center">
          <h3 className="font-display text-base font-bold text-white">{emptyTitle}</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {emptyDescription}
          </p>
        </div>
      )}
    </section>
  )
}
