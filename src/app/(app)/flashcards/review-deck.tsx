'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Brain, CheckCircle2, Eye, Sparkles } from 'lucide-react'

import { rateFlashcardAction } from '@/app/(app)/flashcards/actions'
import type { Flashcard, Subject } from '@/lib/database.types'
import { subjectColor } from '@/lib/format'

const ratings = [
  { label: 'Errei', score: 1, className: 'border-atlas-red/30 bg-atlas-red/10 text-atlas-red' },
  { label: 'Difícil', score: 2, className: 'border-atlas-yellow/30 bg-atlas-yellow/10 text-atlas-yellow' },
  { label: 'Lembrei', score: 3, className: 'border-atlas-400/30 bg-atlas-400/10 text-atlas-400' },
  { label: 'Fácil', score: 4, className: 'border-atlas-green/30 bg-atlas-green/10 text-atlas-green' },
  { label: 'Dominei', score: 5, className: 'border-atlas-green/40 bg-atlas-green/15 text-atlas-green' },
] as const

function cardStatus(card: Flashcard) {
  if (card.last_score !== null && card.last_score <= 2) return 'Card fraco'
  if (!card.last_reviewed_at) return 'Novo'
  return 'Vencido'
}

export function ReviewDeck({ cards, subjects }: { cards: Flashcard[]; subjects: Subject[] }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const activeCards = cards.filter((card) => !reviewedIds.has(card.id))

  if (!activeCards.length) {
    return (
      <section className="dashboard-panel flex min-h-[320px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-3xl bg-atlas-green/10 text-atlas-green">
          <CheckCircle2 className="size-7" />
        </div>
        <h3 className="font-display text-xl font-extrabold text-white">Baralho do dia concluido</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          Boa. O sistema recalculou os proximos intervalos com base na sua resposta.
        </p>
      </section>
    )
  }

  const safeIndex = Math.min(index, activeCards.length - 1)
  const card = activeCards[safeIndex]
  const subject = subjects.find((item) => item.id === card.subject_id)
  const color = subjectColor(subject?.name ?? card.front)
  const progress = Math.round(((cards.length - activeCards.length) / cards.length) * 100)

  function goTo(nextIndex: number) {
    setIndex(Math.max(0, Math.min(activeCards.length - 1, nextIndex)))
    setFlipped(false)
  }

  function markReviewed(cardId: string) {
    setReviewedIds((current) => new Set([...current, cardId]))
    setFlipped(false)
  }

  return (
    <section className="dashboard-panel overflow-hidden p-0">
      <div className="border-b border-white/10 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="dashboard-eyebrow">Revisao do dia</p>
            <h3 className="mt-1 font-display text-lg font-extrabold text-white">
              Baralho ativo
            </h3>
          </div>
          <span className="dashboard-chip">
            <Brain className="size-3.5" />
            {safeIndex + 1} de {activeCards.length} restantes
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-atlas-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-ink-950"
              style={{ backgroundColor: color }}
            >
              {subject?.name ?? 'Memoria geral'}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-semibold text-slate-400">
              {cardStatus(card)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => goTo(safeIndex - 1)}
              disabled={safeIndex === 0}
            >
              <ArrowLeft className="size-4" />
              Anterior
            </button>
            <button
              className="button-secondary"
              type="button"
              onClick={() => goTo(safeIndex + 1)}
              disabled={safeIndex >= activeCards.length - 1}
            >
              Proximo
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => setFlipped(!flipped)}
          className="group relative min-h-[320px] w-full overflow-hidden rounded-[30px] border border-white/10 bg-ink-900 p-8 text-center transition hover:-translate-y-1 hover:border-white/20"
          type="button"
        >
          <div
            className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full opacity-25 blur-2xl"
            style={{ backgroundColor: color }}
          />
          <div
            className="pointer-events-none absolute -bottom-24 left-10 size-48 rounded-full opacity-10 blur-2xl"
            style={{ backgroundColor: color }}
          />
          <div className="relative mx-auto flex min-h-[250px] max-w-3xl flex-col items-center justify-center">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              {flipped ? <Sparkles className="size-3" /> : <Eye className="size-3" />}
              {flipped ? 'Resposta' : 'Pergunta'}
            </span>
            <p className="text-balance text-lg font-bold leading-8 text-white md:text-2xl">
              {flipped ? card.back : card.front}
            </p>
            <span className="mt-6 text-xs font-semibold text-slate-600">
              {flipped ? 'Marque sua retencao abaixo' : 'Clique para revelar a resposta'}
            </span>
          </div>
        </button>

        {flipped ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {ratings.map((rating) => (
              <form
                action={rateFlashcardAction}
                key={rating.score}
                onSubmit={() => markReviewed(card.id)}
              >
                <input type="hidden" name="id" value={card.id} />
                <input type="hidden" name="score" value={rating.score} />
                <button
                  className={`w-full rounded-2xl border px-3 py-3 text-sm font-bold transition hover:-translate-y-0.5 ${rating.className}`}
                >
                  {rating.label}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
