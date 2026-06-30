import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HelpCircle,
  RefreshCcw,
  Sparkles,
  Target,
} from 'lucide-react'

import {
  generateScheduleAction,
  rescheduleOverdueTasksAction,
} from '@/app/(app)/cronograma/actions'
import { toggleTaskAction } from '@/app/(app)/dashboard/actions'
import { SectionEmpty } from '@/components/section-empty'
import type { StudyTask, Subject, TaskType } from '@/lib/database.types'
import { formatDate, subjectColor, todayIso } from '@/lib/format'
import { cycleProgress } from '@/lib/study-plan'
import { requireWorkspace } from '@/lib/workspace'

type SearchParams = {
  projeto?: string
  semana?: string
}

const weekDayLabels = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado']

const legend = [
  ['Estudo', 'bg-sky-500'],
  ['Questoes', 'bg-violet-500'],
  ['Revisao', 'bg-emerald-500'],
  ['Concluido', 'bg-atlas-green'],
  ['Atrasado', 'bg-atlas-red'],
] as const

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function startOfWeek(dateIso: string, offset: number) {
  const date = new Date(`${dateIso}T12:00:00`)
  date.setDate(date.getDate() - date.getDay() + offset * 7)
  return date
}

function weekHref(projectId: string, offset: number) {
  return `/cronograma?projeto=${projectId}&semana=${offset}`
}

function taskTypeLabel(type: TaskType) {
  const labels: Record<TaskType, string> = {
    study: 'Estudo',
    revision: 'Revisao',
    questions: 'Questoes',
    mock: 'Simulado',
    material: 'Material',
  }
  return labels[type]
}

function taskTone(task: StudyTask, today: string) {
  if (task.status === 'done') {
    return {
      card: 'border-atlas-green/30 bg-atlas-green/15 text-slate-100',
      badge: 'bg-atlas-green text-ink-950',
      label: 'Concluido',
    }
  }

  if (task.scheduled_for < today) {
    return {
      card: 'border-atlas-red/40 bg-atlas-red/20 text-slate-100',
      badge: 'bg-atlas-red text-white',
      label: 'Atrasado',
    }
  }

  if (task.task_type === 'revision') {
    return {
      card: 'border-emerald-400/30 bg-emerald-400/15 text-slate-100',
      badge: 'bg-emerald-400 text-ink-950',
      label: 'Revisao',
    }
  }

  if (task.task_type === 'questions' || task.task_type === 'mock') {
    return {
      card: 'border-violet-400/30 bg-violet-400/15 text-slate-100',
      badge: 'bg-violet-400 text-white',
      label: task.task_type === 'mock' ? 'Simulado' : 'Questoes',
    }
  }

  if (task.task_type === 'material') {
    return {
      card: 'border-amber-400/30 bg-amber-400/15 text-slate-100',
      badge: 'bg-amber-400 text-ink-950',
      label: 'Material',
    }
  }

  return {
    card: 'border-sky-400/30 bg-sky-400/15 text-slate-100',
    badge: 'bg-sky-400 text-ink-950',
    label: 'Estudo',
  }
}

function groupByDate(tasks: StudyTask[]) {
  const grouped = new Map<string, StudyTask[]>()
  for (const task of tasks) {
    grouped.set(task.scheduled_for, [...(grouped.get(task.scheduled_for) ?? []), task])
  }
  return grouped
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}min`
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`
}

function weekLabel(offset: number) {
  if (offset === 0) return 'semana atual'
  if (offset === 1) return 'proxima semana'
  if (offset === -1) return 'semana anterior'
  return offset > 0 ? `semana +${offset}` : `semana ${offset}`
}

export default async function CronogramaPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(searchParams.projeto)
  if (!project) {
    return (
      <SectionEmpty
        title="Selecione um edital"
        description="Crie seu primeiro concurso para gerar o cronograma."
      />
    )
  }

  const today = todayIso()
  const offset = Number.isFinite(Number(searchParams.semana))
    ? Number(searchParams.semana)
    : 0
  const start = startOfWeek(today, offset)
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    return {
      iso: toIso(date),
      label: weekDayLabels[index],
      date: formatDate(toIso(date)),
    }
  })
  const endIso = weekDays[6].iso

  const [{ data: weekRows }, { data: overdueRows }] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .gte('scheduled_for', weekDays[0].iso)
      .lte('scheduled_for', endIso)
      .order('scheduled_for')
      .order('created_at'),
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .neq('status', 'done')
      .lt('scheduled_for', today)
      .order('scheduled_for'),
  ])

  const weekTasks = (weekRows ?? []) as StudyTask[]
  const overdueTasks = (overdueRows ?? []) as StudyTask[]
  const grouped = groupByDate(weekTasks)
  const completed = weekTasks.filter((task) => task.status === 'done').length
  const totalMinutes = weekTasks.reduce((sum, task) => sum + task.duration_min, 0)
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]))
  const pendingWeekTasks = weekTasks.filter((task) => task.status !== 'done')
  const nextTask =
    overdueTasks[0] ??
    pendingWeekTasks.find((task) => task.scheduled_for >= today) ??
    pendingWeekTasks[0] ??
    null
  const progress = cycleProgress(weekTasks)
  const revisionCount = weekTasks.filter((task) => task.task_type === 'revision').length
  const questionCount = weekTasks.filter((task) => task.task_type === 'questions' || task.task_type === 'mock').length

  return (
    <div className="dashboard-reveal space-y-5">
      <section className="dashboard-hero">
        <div className="dashboard-hero-orb dashboard-hero-orb-one" />
        <div className="dashboard-hero-orb dashboard-hero-orb-two" />
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="dashboard-eyebrow flex items-center gap-2">
              <CalendarDays className="size-4" />
              Execução do plano
            </p>
            <h2 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em] text-white">
              Sua semana sem se perder.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Primeiro execute o próximo bloco. Depois, se quiser, olhe a grade semanal completa.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={generateScheduleAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button className="button-primary">
                <Sparkles className="size-4" />
                Gerar cronograma
              </button>
            </form>

            <Link href={`/plano?projeto=${project.id}`} className="button-secondary">
              <Target className="size-4" />
              Ver plano
            </Link>

            {overdueTasks.length ? (
              <form action={rescheduleOverdueTasksAction}>
                <input type="hidden" name="projectId" value={project.id} />
                <button className="button-secondary">
                  <RefreshCcw className="size-4" />
                  Reorganizar atrasadas
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <article className="dashboard-panel overflow-hidden p-0">
          <div className="border-b border-white/10 bg-gradient-to-r from-atlas-400/10 via-atlas-violet/10 to-transparent p-5">
            <p className="dashboard-eyebrow">Faça agora</p>
            <h3 className="mt-1 font-display text-xl font-extrabold text-white">
              {nextTask?.title ?? 'Nenhum bloco pendente nesta semana'}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {nextTask
                ? `${nextTask.notes ?? 'Bloco do cronograma'} · ${nextTask.duration_min}min · ${formatDate(nextTask.scheduled_for)}`
                : 'Gere um ciclo no plano ou avance para a próxima semana.'}
            </p>
          </div>
          {nextTask ? (
            <div className="p-5">
              <div className="rounded-[24px] border border-white/10 bg-ink-900/70 p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${taskTone(nextTask, today).badge}`}>
                    {taskTone(nextTask, today).label}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-slate-400">
                    {nextTask.duration_min}min
                  </span>
                </div>
                <p className="break-words text-sm leading-6 text-slate-300">
                  {nextTask.notes ?? subjectMap.get(nextTask.subject_id ?? '')?.name ?? taskTypeLabel(nextTask.task_type)}
                </p>
                <form action={toggleTaskAction} className="mt-5">
                  <input type="hidden" name="taskId" value={nextTask.id} />
                  <input type="hidden" name="status" value="done" />
                  <button className="button-primary w-full justify-center">
                    Concluir próximo bloco
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </article>

        <article className="dashboard-panel">
          <p className="dashboard-eyebrow">Progresso da semana</p>
          <div className="mt-4 flex items-center gap-5">
            <div className="grid size-28 place-items-center rounded-full border border-atlas-400/20 bg-atlas-400/10">
              <div className="text-center">
                <strong className="font-display text-3xl font-extrabold text-white">{progress.percent}%</strong>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">feito</p>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm text-slate-400">
              <p><strong className="text-white">{completed}/{weekTasks.length}</strong> sessões concluídas</p>
              <p><strong className="text-white">{revisionCount}</strong> revisões na semana</p>
              <p><strong className="text-white">{questionCount}</strong> blocos de questões/simulado</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="dashboard-metric-card">
          <Clock3 className="mb-3 size-5 text-atlas-400" />
          <p className="dashboard-eyebrow">Carga da semana</p>
          <strong className="mt-2 block font-display text-2xl text-white">
            {formatMinutes(totalMinutes)}
          </strong>
        </div>
        <div className="dashboard-metric-card">
          <CheckCircle2 className="mb-3 size-5 text-atlas-green" />
          <p className="dashboard-eyebrow">Concluidas</p>
          <strong className="mt-2 block font-display text-2xl text-white">
            {completed}/{weekTasks.length}
          </strong>
        </div>
        <div className="dashboard-metric-card">
          <AlertTriangle className="mb-3 size-5 text-atlas-red" />
          <p className="dashboard-eyebrow">Atrasadas</p>
          <strong className="mt-2 block font-display text-2xl text-white">
            {overdueTasks.length}
          </strong>
        </div>
        <div className="dashboard-metric-card">
          <HelpCircle className="mb-3 size-5 text-violet-300" />
          <p className="dashboard-eyebrow">Dica Atlas</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Cores fortes pedem acao. Vermelho primeiro, depois revisao e questoes.
          </p>
        </div>
      </section>

      <section className="dashboard-panel">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="dashboard-eyebrow">Veja sua programacao: {weekLabel(offset)}</p>
            <h3 className="mt-1 font-display text-xl font-extrabold text-white">
              {formatDate(weekDays[0].iso)} ate {formatDate(endIso)}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link className="button-secondary" href={weekHref(project.id, offset - 1)}>
              <ChevronLeft className="size-4" />
              Semana anterior
            </Link>
            <Link className="button-secondary" href={weekHref(project.id, 0)}>
              Semana atual
            </Link>
            <Link className="button-secondary" href={weekHref(project.id, offset + 1)}>
              Proxima semana
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-3 border-y border-white/[0.07] py-3">
          {legend.map(([label, color]) => (
            <span key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <span className={`size-2.5 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>

        {!weekTasks.length ? (
          <SectionEmpty
            title="Semana vazia"
            description="Clique em Gerar cronograma para criar um plano baseado em sua rotina."
          />
        ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            <div className="grid min-w-[900px] grid-cols-7 overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-950/35 xl:min-w-[1060px]">
              {weekDays.map((day) => {
                const tasks = grouped.get(day.iso) ?? []
                const minutes = tasks.reduce((sum, task) => sum + task.duration_min, 0)
                const isToday = day.iso === today

                return (
                  <section
                    key={day.iso}
                    className={`min-h-[560px] border-r border-white/[0.07] last:border-r-0 ${
                      isToday ? 'bg-atlas-400/[0.06]' : ''
                    }`}
                  >
                    <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-ink-950/95 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            {day.label}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-300">{day.date}</p>
                        </div>
                        {isToday ? (
                          <span className="rounded-full bg-atlas-400 px-2 py-1 text-[10px] font-bold text-white">
                            Hoje
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-600">
                        {tasks.length ? `${tasks.length} blocos - ${formatMinutes(minutes)}` : 'Dia livre'}
                      </p>
                    </header>

                    <div className="space-y-2 p-2.5">
                      {tasks.length ? (
                        tasks.map((task) => {
                          const subject = task.subject_id ? subjectMap.get(task.subject_id) : null
                          const tone = taskTone(task, today)
                          const color = subjectColor(subject?.name ?? task.title)

                          return (
                            <article
                              key={task.id}
                              className={`rounded-2xl border p-3 shadow-[0_14px_40px_rgba(0,0,0,.18)] ${tone.card}`}
                            >
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${tone.badge}`}>
                                  {tone.label}
                                </span>
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-slate-300">
                                  {task.duration_min}min
                                </span>
                              </div>

                              <div className="mb-2 flex gap-2">
                                <span
                                  className="mt-1 size-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <div className="min-w-0">
                                  <h4 className="break-words text-xs font-extrabold leading-5 text-white">
                                    {task.title}
                                  </h4>
                                  <p className="mt-1 break-words text-[11px] leading-4 text-slate-400">
                                    {task.notes || subject?.name || taskTypeLabel(task.task_type)}
                                  </p>
                                </div>
                              </div>

                              <form action={toggleTaskAction}>
                                <input type="hidden" name="taskId" value={task.id} />
                                <input
                                  type="hidden"
                                  name="status"
                                  value={task.status === 'done' ? 'pending' : 'done'}
                                />
                                <button className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-slate-200 transition hover:border-white/20 hover:bg-white/10">
                                  {task.status === 'done' ? 'Reabrir' : 'Concluir'}
                                </button>
                              </form>
                            </article>
                          )
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/[0.08] p-4 text-center text-xs leading-5 text-slate-600">
                          Nenhum bloco programado.
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
