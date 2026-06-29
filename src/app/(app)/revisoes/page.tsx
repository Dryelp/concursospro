import Link from 'next/link'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  HelpCircle,
  Layers3,
  RefreshCcw,
  Target,
} from 'lucide-react'

import { rateReviewAction } from '@/app/(app)/revisoes/actions'
import { SectionEmpty } from '@/components/section-empty'
import type { Flashcard, MockQuestion, ReviewItem, StudyTask } from '@/lib/database.types'
import { formatDate, subjectColor, todayIso } from '@/lib/format'
import { buildRevisionInsight } from '@/lib/revision-intelligence'
import { requireWorkspace } from '@/lib/workspace'

const ratings = [
  ['Difícil', 1],
  ['Regular', 2],
  ['Ok', 3],
  ['Bom', 4],
  ['Ótimo', 5],
] as const

function priorityTone(priority: 'Alta' | 'Media' | 'Leve') {
  if (priority === 'Alta') return 'border-atlas-red/30 bg-atlas-red/10 text-atlas-red'
  if (priority === 'Media') return 'border-atlas-yellow/30 bg-atlas-yellow/10 text-atlas-yellow'
  return 'border-atlas-green/30 bg-atlas-green/10 text-atlas-green'
}

export default async function RevisoesPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(searchParams.projeto)

  if (!project) {
    return (
      <SectionEmpty
        title="Sem concurso ativo"
        description="Adicione um edital antes de iniciar revisões."
      />
    )
  }

  const today = todayIso()
  const [{ data: reviewRows }, { data: taskRows }, { data: wrongRows }, { data: flashcardRows }] =
    await Promise.all([
      supabase
        .from('review_items')
        .select('*')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lte('next_review_at', today)
        .order('next_review_at'),
      supabase
        .from('study_tasks')
        .select('*')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .order('scheduled_for', { ascending: false })
        .limit(200),
      supabase
        .from('mock_questions')
        .select('*')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .eq('is_correct', false)
        .order('answered_at', { ascending: false })
        .limit(120),
      supabase
        .from('flashcards')
        .select('*')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .eq('suspended', false)
        .order('created_at', { ascending: false })
        .limit(160),
    ])

  const reviews = (reviewRows ?? []) as ReviewItem[]
  const tasks = (taskRows ?? []) as StudyTask[]
  const wrongQuestions = (wrongRows ?? []) as MockQuestion[]
  const flashcards = (flashcardRows ?? []) as Flashcard[]
  const cards = reviews.map((review) => ({
    review,
    insight: buildRevisionInsight({
      review,
      subjects,
      tasks,
      wrongQuestions,
      flashcards,
      today,
    }),
  }))
  const highPriority = cards.filter((card) => card.insight.priority === 'Alta').length
  const wrongSignals = cards.reduce((total, card) => total + card.insight.stats.wrongQuestions, 0)
  const flashcardSignals = cards.reduce((total, card) => total + card.insight.stats.weakFlashcards, 0)

  return (
    <div className="dashboard-reveal space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="dashboard-eyebrow">Revisão inteligente</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
            O que revisar agora
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            A fila cruza repetição espaçada, tarefas do cronograma, erros em questões e flashcards
            fracos para indicar exatamente onde recuperar pontos.
          </p>
        </div>
        <span className="dashboard-chip">
          <RefreshCcw className="size-3.5" />
          {reviews.length} {reviews.length === 1 ? 'pendente' : 'pendentes'}
        </span>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-red/10 text-atlas-red">
            <AlertTriangle className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Prioridade alta</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {highPriority}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Revisões com atraso, erro recente ou última nota baixa.
          </p>
        </div>
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-400">
            <HelpCircle className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Erros conectados</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {wrongSignals}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Questões erradas usadas como sinal de necessidade.
          </p>
        </div>
        <div className="dashboard-metric-card">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-green/10 text-atlas-green">
            <Brain className="size-5" />
          </div>
          <p className="dashboard-eyebrow">Memória ativa</p>
          <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
            {flashcardSignals}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Flashcards vencidos ou fracos puxando revisão.
          </p>
        </div>
      </section>

      {!cards.length ? (
        <SectionEmpty
          title="Tudo em dia"
          description="Nenhuma revisão pendente. Continue executando o cronograma e respondendo questões."
        />
      ) : (
        <div className="space-y-4">
          {cards.map(({ review, insight }) => (
            <article key={review.id} className="dashboard-panel overflow-hidden p-0">
              <div
                className="h-1.5"
                style={{ backgroundColor: subjectColor(insight.subjectName) }}
              />
              <div className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-400">
                      <RefreshCcw className="size-5" />
                    </div>
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${priorityTone(
                            insight.priority,
                          )}`}
                        >
                          Prioridade {insight.priority}
                        </span>
                        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-400">
                          {formatDate(review.next_review_at)}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-extrabold text-white">
                        {insight.subjectName}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-atlas-400">
                        {insight.topic}
                      </p>
                      <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
                        Intervalo atual: {review.interval_days} dias · facilidade{' '}
                        {Number(review.ease_factor).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <Link
                    className="button-secondary justify-center"
                    href={`/simulados?projeto=${project.id}`}
                  >
                    <Target className="size-4" />
                    Gerar questões
                  </Link>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
                  <div className="rounded-[22px] border border-white/10 bg-ink-900/60 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                      <Layers3 className="size-4 text-atlas-400" />
                      Por que revisar agora
                    </div>
                    <ul className="space-y-2 text-sm leading-6 text-slate-400">
                      {insight.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-atlas-400" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-[22px] border border-white/10 bg-ink-900/60 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                      <CheckCircle2 className="size-4 text-atlas-green" />
                      Como revisar em 15 minutos
                    </div>
                    <ol className="space-y-2 text-sm leading-6 text-slate-400">
                      {insight.checklist.map((item, index) => (
                        <li key={item} className="flex gap-3">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-[11px] font-bold text-slate-300">
                            {index + 1}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs font-semibold text-slate-500">
                    Depois de revisar, marque sua retenção para o sistema ajustar a próxima data.
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ratings.map(([label, score]) => (
                      <form key={score} action={rateReviewAction}>
                        <input type="hidden" name="id" value={review.id} />
                        <input type="hidden" name="score" value={score} />
                        <button className="button-secondary">{label}</button>
                      </form>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
