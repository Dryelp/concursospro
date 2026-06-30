import Link from 'next/link'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileQuestion,
  Layers3,
  Sparkles,
  Target,
} from 'lucide-react'

import { generateScheduleAction } from '@/app/(app)/cronograma/actions'
import { updateSubjectMasteryAction } from '@/app/(app)/plano/actions'
import { SectionEmpty } from '@/components/section-empty'
import type { MockQuestion, StudyTask } from '@/lib/database.types'
import { subjectColor, todayIso } from '@/lib/format'
import {
  buildCycleSessions,
  buildSubjectPlanSummaries,
  cycleProgress,
  masteryLabel,
  masteryLevel,
  typeLabel,
} from '@/lib/study-plan'
import { requireWorkspace } from '@/lib/workspace'

const levels = [
  ['iniciante', 'Iniciante', 'mais teoria e revisão guiada'],
  ['intermediario', 'Intermediário', 'equilíbrio entre teoria e questões'],
  ['avancado', 'Avançado', 'mais questões e manutenção'],
] as const

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}min`
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`
}

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(searchParams.projeto)

  if (!project) {
    return (
      <SectionEmpty
        title="Sem edital ativo"
        description="Adicione um edital para montar seu plano de estudos."
      />
    )
  }

  const [{ data: taskRows }, { data: wrongRows }] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .order('scheduled_for')
      .limit(500),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .order('answered_at', { ascending: false })
      .limit(300),
  ])

  const tasks = (taskRows ?? []) as StudyTask[]
  const wrongQuestions = (wrongRows ?? []) as MockQuestion[]
  const summaries = buildSubjectPlanSummaries(subjects, tasks, wrongQuestions)
  const sessions = buildCycleSessions(summaries, tasks, 18)
  const progress = cycleProgress(tasks)
  const plannedMinutes = tasks.reduce((sum, task) => sum + task.duration_min, 0)
  const completedMinutes = tasks
    .filter((task) => task.status === 'done')
    .reduce((sum, task) => sum + task.duration_min, 0)
  const pending = tasks.filter((task) => task.status !== 'done')
  const overdue = pending.filter((task) => task.scheduled_for < todayIso())
  const nextSession = sessions[0] ?? null

  return (
    <div className="dashboard-reveal space-y-5">
      <section className="dashboard-hero">
        <div className="dashboard-hero-orb dashboard-hero-orb-one" />
        <div className="dashboard-hero-orb dashboard-hero-orb-two" />
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.3fr_.7fr] xl:items-end">
          <div>
            <p className="dashboard-eyebrow flex items-center gap-2">
              <Sparkles className="size-4" />
              Plano inteligente
            </p>
            <h2 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-[-0.04em] text-white md:text-[40px] md:leading-[1.05]">
              Seu ciclo de estudos, não só uma agenda.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Ajuste seu nível por matéria, veja a distribuição do ciclo e deixe o cronograma executar a estratégia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <form action={generateScheduleAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="button-primary">
                <Sparkles className="size-4" />
                Gerar ciclo
              </button>
            </form>
            <Link className="button-secondary" href={`/cronograma?projeto=${project.id}`}>
              <CalendarDays className="size-4" />
              Executar semana
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={Target} label="Ciclo atual" value={`${progress.percent}%`} detail={`${progress.completed}/${progress.total} sessões`} />
        <Metric icon={Clock3} label="Carga planejada" value={formatMinutes(plannedMinutes)} detail={`${formatMinutes(completedMinutes)} concluídos`} />
        <Metric icon={Layers3} label="Atrasadas" value={overdue.length} detail="reorganize antes de acumular" />
        <Metric icon={BookOpen} label="Matérias" value={subjects.length} detail="vindas do edital" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <article className="dashboard-panel overflow-hidden p-0">
          <div className="border-b border-white/10 bg-gradient-to-r from-atlas-400/10 via-atlas-violet/10 to-transparent p-5">
            <p className="dashboard-eyebrow">Próximo bloco</p>
            <h3 className="mt-1 font-display text-xl font-extrabold text-white">
              {nextSession ? nextSession.subjectName : 'Gere seu ciclo para começar'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {nextSession
                ? `${typeLabel(nextSession.type)} de ${nextSession.duration}min em ${nextSession.topic}`
                : 'O plano usa nível, erros recentes e matérias do edital para distribuir os estudos.'}
            </p>
          </div>

          {nextSession ? (
            <div className="p-5">
              <div className="rounded-[26px] border border-white/10 bg-ink-900/70 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="size-3 rounded-full shadow-[0_0_18px_currentColor]"
                    style={{ backgroundColor: nextSession.color, color: nextSession.color }}
                  />
                  <span className="dashboard-eyebrow">{typeLabel(nextSession.type)}</span>
                </div>
                <h4 className="font-display text-2xl font-extrabold text-white">{nextSession.subjectName}</h4>
                <p className="mt-2 text-sm leading-6 text-slate-300">{nextSession.topic}</p>
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-xs leading-5 text-slate-500">
                  {nextSession.reason}
                </p>
                <Link className="button-primary mt-5 w-full justify-center" href={`/cronograma?projeto=${project.id}&filtro=hoje`}>
                  Começar pelo cronograma
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <SectionEmpty
                title="Nenhum ciclo gerado"
                description="Clique em Gerar ciclo para criar os blocos de estudo a partir do edital."
              />
            </div>
          )}
        </article>

        <article className="dashboard-panel">
          <p className="dashboard-eyebrow">Distribuição por disciplina</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">
            Onde seu tempo está indo
          </h3>
          <div className="mt-5 space-y-4">
            {summaries.length ? (
              summaries.slice(0, 8).map((item) => {
                const percent = plannedMinutes ? Math.round((item.totalMinutes / plannedMinutes) * 100) : 0
                return (
                  <div key={item.subject.id}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-bold text-slate-200">{item.subject.name}</span>
                      <span className="font-semibold text-slate-500">{percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: item.color }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">
                      {masteryLabel(item.level)} · {formatMinutes(item.totalMinutes)} · {item.wrongQuestions} erro{item.wrongQuestions === 1 ? '' : 's'}
                    </p>
                  </div>
                )
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
                Cadastre matérias no edital para ver a distribuição.
              </p>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
        <article className="dashboard-panel">
          <p className="dashboard-eyebrow">Sequência do ciclo</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">
            Ordem recomendada dos estudos
          </h3>
          <div className="mt-5 space-y-3">
            {sessions.length ? (
              sessions.map((session, index) => (
                <div key={`${session.id}-${index}`} className="rounded-[22px] border border-white/10 bg-ink-900/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white/5 font-display text-xs font-extrabold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: session.color }}>
                          {typeLabel(session.type)} · {session.duration}min
                        </p>
                        <h4 className="mt-1 break-words font-display text-base font-extrabold text-white">
                          {session.subjectName}
                        </h4>
                        <p className="mt-1 break-words text-sm leading-5 text-slate-400">{session.topic}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold text-slate-500">
                      {session.completed ? 'Concluído' : 'Na fila'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{session.reason}</p>
                </div>
              ))
            ) : (
              <SectionEmpty
                title="Ciclo vazio"
                description="Gere o cronograma para criar a sequência inicial."
              />
            )}
          </div>
        </article>

        <article className="dashboard-panel">
          <p className="dashboard-eyebrow">Nível por matéria</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">
            Ajuste a distribuição
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Iniciante recebe mais teoria; avançado recebe mais questões e revisão de manutenção.
          </p>

          <div className="mt-5 space-y-4">
            {subjects.map((subject) => {
              const current = masteryLevel(subject.mastery)
              return (
                <div key={subject.id} className="rounded-[22px] border border-white/10 bg-ink-900/60 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: subjectColor(subject.name) }} />
                    <strong className="min-w-0 break-words text-sm text-white">{subject.name}</strong>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {levels.map(([value, label, description]) => (
                      <form key={value} action={updateSubjectMasteryAction}>
                        <input type="hidden" name="subjectId" value={subject.id} />
                        <input type="hidden" name="level" value={value} />
                        <button
                          className={`h-full w-full rounded-2xl border p-3 text-left transition ${
                            current === value
                              ? 'border-atlas-400 bg-atlas-400/10 text-atlas-400'
                              : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20'
                          }`}
                        >
                          <span className="flex items-center gap-2 text-xs font-extrabold">
                            {current === value ? <CheckCircle2 className="size-3.5" /> : <CircleDot className="size-3.5" />}
                            {label}
                          </span>
                          <span className="mt-1 block text-[10px] leading-4 opacity-75">{description}</span>
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </article>
      </section>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof BarChart3
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="dashboard-metric-card">
      <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-400">
        <Icon className="size-5" />
      </div>
      <p className="dashboard-eyebrow">{label}</p>
      <strong className="mt-2 block font-display text-3xl font-extrabold text-white">{value}</strong>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}
