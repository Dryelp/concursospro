import { Brain, Flame, Layers3, Sparkles, Zap } from 'lucide-react'

import { FlashGenerator } from '@/app/(app)/flashcards/generator'
import { ReviewDeck } from '@/app/(app)/flashcards/review-deck'
import { SectionEmpty } from '@/components/section-empty'
import type { Flashcard, MockQuestion, ReviewItem } from '@/lib/database.types'
import {
  buildFlashcardSubjectStats,
  buildFlashcardSuggestions,
} from '@/lib/flashcard-intelligence'
import { subjectColor, todayIso } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'

function percent(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(searchParams.projeto)

  if (!project) {
    return (
      <SectionEmpty
        title="Sem concurso ativo"
        description="Adicione um edital antes de criar flashcards."
      />
    )
  }

  const today = todayIso()
  const [{ data: cardRows }, { data: wrongRows }, { data: reviewRows }] = await Promise.all([
    supabase
      .from('flashcards')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('suspended', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .order('answered_at', { ascending: false })
      .limit(120),
    supabase
      .from('review_items')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('next_review_at', today)
      .order('next_review_at')
      .limit(80),
  ])

  const all = (cardRows ?? []) as Flashcard[]
  const wrongQuestions = (wrongRows ?? []) as MockQuestion[]
  const reviews = (reviewRows ?? []) as ReviewItem[]
  const due = all.filter((card) => !card.next_review_at || card.next_review_at <= today)
  const weak = all.filter((card) => card.last_score !== null && card.last_score <= 2)
  const scored = all.filter((card) => card.last_score !== null)
  const retention = percent(scored.filter((card) => Number(card.last_score) >= 3).length, scored.length)
  const subjectStats = buildFlashcardSubjectStats({ subjects, cards: all, today })
  const suggestions = buildFlashcardSuggestions({
    subjects,
    wrongQuestions,
    reviews,
    cards: all,
    today,
  })

  return (
    <div className="dashboard-reveal space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="dashboard-eyebrow">Memoria ativa</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
            Flashcards inteligentes
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Gere cards por topico, revise no ciclo certo e deixe erros/revisoes puxarem o que
            precisa ser memorizado primeiro.
          </p>
        </div>
        <span className="dashboard-chip">
          <Zap className="size-3.5" />
          {all.length} {all.length === 1 ? 'card criado' : 'cards criados'}
        </span>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-400">
            <Layers3 className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Para hoje</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {due.length}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">Cards vencidos ou novos na fila.</p>
        </div>
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-red/10 text-atlas-red">
            <Flame className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Fracos</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {weak.length}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">Cards marcados como dificeis.</p>
        </div>
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-green/10 text-atlas-green">
            <Brain className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Retencao</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {retention}%
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">Cards lembrados nas revisoes.</p>
        </div>
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-violet/10 text-atlas-violet">
            <Sparkles className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Sugestoes</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {suggestions.length}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">Topicos puxados por desempenho.</p>
        </div>
      </section>

      {subjects.length ? (
        <FlashGenerator projectId={project.id} subjects={subjects} suggestions={suggestions} />
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
        <div>
          {due.length ? (
            <ReviewDeck cards={due} subjects={subjects} />
          ) : (
            <SectionEmpty
              title="Nenhum flashcard pendente"
              description={
                all.length
                  ? 'Suas proximas revisoes ainda nao venceram.'
                  : 'Gere seu primeiro baralho por materia e topico.'
              }
            />
          )}
        </div>

        <aside className="dashboard-panel">
          <p className="dashboard-eyebrow">Mapa de memoria</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">
            Por materia
          </h3>
          <div className="mt-5 space-y-4">
            {subjectStats.length ? (
              subjectStats.map((item) => (
                <div key={item.subjectId}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold text-slate-200">{item.subjectName}</span>
                    <span className="font-semibold text-slate-500">
                      {item.retention}% retencao
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, item.retention)}%`,
                        backgroundColor: subjectColor(item.subjectName),
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {item.total} cards · {item.due} vencidos · {item.weak} fracos
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-slate-500">
                Quando voce criar e revisar cards, este mapa mostra onde a memoria esta forte ou
                falhando.
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
