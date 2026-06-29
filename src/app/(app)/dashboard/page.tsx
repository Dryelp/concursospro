import Link from 'next/link'
import {
  ArrowRight,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileQuestion,
  Flame,
  Layers3,
  Play,
  RefreshCcw,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { toggleTaskAction } from '@/app/(app)/dashboard/actions'
import { EmptyState } from '@/components/empty-state'
import type { Flashcard, MockQuestion, ReviewItem, StudyTask, Subject } from '@/lib/database.types'
import { daysUntil, formatDate, subjectColor, todayIso } from '@/lib/format'
import { addDaysIso } from '@/lib/study'
import { requireWorkspace } from '@/lib/workspace'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(
    searchParams.projeto,
  )

  if (!project) {
    return (
      <section className="panel">
        <EmptyState
          icon={Target}
          title="Nenhum concurso ainda"
          description="Adicione seu primeiro edital para começar."
          action={
            <Link href="/editais?novo=1" className="button-primary">
              Adicionar edital
            </Link>
          }
        />
      </section>
    )
  }

  const [
    { data: taskRows },
    { data: reviewRows },
    { data: profileRow },
    { data: wrongQuestionRows },
    { data: flashcardRows },
  ] = await Promise.all([
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .order('scheduled_for'),
    supabase
      .from('review_items')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('profiles')
      .select('nome')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('is_correct', false)
      .order('answered_at', { ascending: false })
      .limit(20),
    supabase
      .from('flashcards')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('suspended', false)
      .order('created_at', { ascending: false })
      .limit(80),
  ])

  const tasks = (taskRows ?? []) as StudyTask[]
  const reviews = (reviewRows ?? []) as ReviewItem[]
  const wrongQuestions = (wrongQuestionRows ?? []) as MockQuestion[]
  const flashcards = (flashcardRows ?? []) as Flashcard[]
  const displayName =
    typeof profileRow?.nome === 'string' && profileRow.nome.trim()
      ? profileRow.nome.trim().split(/\s+/)[0]
      : user.email?.split('@')[0] ?? 'aluno'
  const today = todayIso()
  const done = tasks.filter((item) => item.status === 'done')
  const pending = tasks.filter((item) => item.status !== 'done')
  const todayTasks = tasks.filter((item) => item.scheduled_for === today)
  const todayDone = todayTasks.filter((item) => item.status === 'done')
  const due = reviews
    .filter((item) => item.next_review_at <= today)
    .sort((left, right) => left.next_review_at.localeCompare(right.next_review_at))
  const dueFlashcards = flashcards.filter(
    (item) => !item.next_review_at || item.next_review_at <= today,
  )
  const weakFlashcards = flashcards.filter(
    (item) => item.last_score !== null && item.last_score <= 2,
  )
  const overdueTasks = pending.filter((item) => item.scheduled_for < today)
  const totalMinutes = done.reduce((sum, item) => sum + item.duration_min, 0)
  const plannedMinutes = tasks.reduce((sum, item) => sum + item.duration_min, 0)
  const todayPlannedMinutes = todayTasks.reduce(
    (sum, item) => sum + item.duration_min,
    0,
  )
  const todayDoneMinutes = todayDone.reduce(
    (sum, item) => sum + item.duration_min,
    0,
  )
  const totalProgress = tasks.length
    ? Math.round((done.length / tasks.length) * 100)
    : 0
  const todayProgress = todayTasks.length
    ? Math.round((todayDone.length / todayTasks.length) * 100)
    : 0
  const nextTask =
    pending.find((item) => item.scheduled_for >= today) ?? pending[0] ?? null
  const missionTask =
    todayTasks.find((item) => item.status !== 'done') ?? nextTask
  const missionReview = due[0] ?? null
  const missionQuestion = wrongQuestions[0] ?? null
  const missionFlashcard = dueFlashcards[0] ?? null
  const riskLevel =
    overdueTasks.length >= 3 || wrongQuestions.length >= 8
      ? 'alto'
      : due.length + dueFlashcards.length + overdueTasks.length > 0
        ? 'medio'
        : 'controlado'
  const days = daysUntil(project.exam_date)
  const streak = calculateStreak(done, today)
  const week = buildWeek(tasks, today)
  const maxWeekMinutes = Math.max(...week.map((item) => item.planned), 60)

  return (
    <div className="dashboard-reveal space-y-5">
      <section className="dashboard-hero">
        <div className="dashboard-hero-orb dashboard-hero-orb-one" />
        <div className="dashboard-hero-orb dashboard-hero-orb-two" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.35fr_.65fr]">
          <div>
            <p className="mb-3 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-atlas-400">
              <Sparkles className="size-3.5" />
              Plano de aprovação em movimento
            </p>
            <h2 className="max-w-2xl font-display text-3xl font-extrabold tracking-[-0.045em] text-white md:text-[40px] md:leading-[1.05]">
              Olá, {displayName}.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
              Esta e sua central de decisao para hoje: estudar o bloco certo, revisar o que esta vencendo e atacar os pontos fracos.
              <br />
              {project.title}
              {project.position_name ? ` · ${project.position_name}` : ''}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {nextTask ? (
                <Link
                  href={`/cronograma?projeto=${project.id}&filtro=hoje`}
                  className="button-primary"
                >
                  <Play className="size-4 fill-current" />
                  Começar sessão
                </Link>
              ) : (
                <Link
                  href={`/cronograma?projeto=${project.id}`}
                  className="button-primary"
                >
                  <CalendarDays className="size-4" />
                  Criar cronograma
                </Link>
              )}
              <Link
                href={`/revisoes?projeto=${project.id}`}
                className="button-secondary"
              >
                <RefreshCcw className="size-4" />
                {due.length} revisões pendentes
              </Link>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/[0.08] pt-5">
              <HeroMetric
                value={days === null ? '—' : Math.max(days, 0)}
                label="dias para a prova"
              />
              <HeroMetric
                value={`${Math.floor(totalMinutes / 60)}h`}
                label="estudo concluído"
              />
              <HeroMetric value={streak} label="dias de sequência" />
            </div>
          </div>

          <div className="flex items-center justify-center xl:justify-end">
            <ProgressRing
              progress={totalProgress}
              label="do plano"
              detail={`${done.length} de ${tasks.length} sessões`}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_.7fr]">
        <article className="dashboard-panel overflow-hidden p-0">
          <div className="border-b border-white/10 bg-gradient-to-r from-atlas-400/10 via-atlas-violet/10 to-transparent p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="dashboard-eyebrow">Missao de hoje</p>
                <h3 className="mt-1 font-display text-xl font-extrabold text-white">
                  O que fazer agora para ganhar ponto
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Tres acoes curtas, puxadas pelo seu cronograma e pelos sinais de desempenho.
                </p>
              </div>
              <Link href={`/cronograma?projeto=${project.id}&filtro=hoje`} className="button-primary">
                <Play className="size-4 fill-current" />
                Comecar agora
              </Link>
            </div>
          </div>

          <div className="grid gap-3 p-5 lg:grid-cols-3">
            <MissionCard
              icon={Target}
              label="Estudo principal"
              title={missionTask?.title ?? 'Planejar proxima sessao'}
              detail={
                missionTask
                  ? `${missionTask.notes ?? 'Bloco do cronograma'} · ${missionTask.duration_min} min`
                  : 'Crie ou regenere o cronograma para definir o bloco do dia.'
              }
              href={`/cronograma?projeto=${project.id}&filtro=hoje`}
              cta={missionTask ? 'Abrir bloco' : 'Criar plano'}
              tone="blue"
            />
            <MissionCard
              icon={Layers3}
              label="Revisao prioritaria"
              title={missionReview?.title ?? 'Memoria em dia'}
              detail={
                missionReview
                  ? `Venceu em ${formatDate(missionReview.next_review_at)}`
                  : 'Nenhuma revisao vencida neste momento.'
              }
              href={`/revisoes?projeto=${project.id}`}
              cta={missionReview ? 'Revisar' : 'Ver fila'}
              tone={missionReview ? 'red' : 'green'}
            />
            <MissionCard
              icon={FileQuestion}
              label="Ponto fraco"
              title={missionQuestion?.topic ?? missionFlashcard?.front ?? 'Gerar questoes por topico'}
              detail={
                missionQuestion
                  ? 'Ultimo erro registrado em simulados.'
                  : missionFlashcard
                    ? 'Flashcard vencido para reforcar memoria.'
                    : 'Escolha uma materia e gere questoes especificas.'
              }
              href={missionQuestion ? `/simulados?projeto=${project.id}` : `/flashcards?projeto=${project.id}`}
              cta={missionQuestion ? 'Resolver questoes' : 'Memorizar'}
              tone="yellow"
            />
          </div>
        </article>

        <RiskCard
          riskLevel={riskLevel}
          overdueTasks={overdueTasks.length}
          dueReviews={due.length}
          dueFlashcards={dueFlashcards.length}
          weakFlashcards={weakFlashcards.length}
          wrongQuestions={wrongQuestions.length}
          projectId={project.id}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]">
        <article className="dashboard-focus-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-eyebrow">Seu próximo passo</p>
              <h3 className="mt-2 font-display text-xl font-bold">
                {nextTask?.title ?? 'Plano concluído por enquanto'}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {nextTask?.notes ??
                  'Você não possui sessões pendentes. Aproveite para revisar seus pontos frágeis.'}
              </p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-400">
              <Target className="size-5" />
            </div>
          </div>

          {nextTask ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="dashboard-chip">
                <Clock3 className="size-3.5" />
                {nextTask.duration_min} minutos
              </span>
              <span className="dashboard-chip">
                <CalendarDays className="size-3.5" />
                {nextTask.scheduled_for === today
                  ? 'Programado para hoje'
                  : formatDate(nextTask.scheduled_for)}
              </span>
              <span className="dashboard-chip capitalize">
                {nextTask.task_type}
              </span>
            </div>
          ) : null}
        </article>

        <article className="dashboard-daily-card">
          <ProgressRing
            progress={todayProgress}
            size="small"
            label="da meta de hoje"
            detail={`${todayDoneMinutes} de ${todayPlannedMinutes || 0} min`}
          />
          <div className="min-w-0">
            <p className="dashboard-eyebrow">Ritmo diário</p>
            <h3 className="mt-2 font-display text-lg font-bold">
              {todayProgress >= 100
                ? 'Meta cumprida'
                : todayTasks.length
                  ? 'Continue no ritmo'
                  : 'Dia livre no plano'}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {todayDone.length} de {todayTasks.length} sessões concluídas hoje.
            </p>
          </div>
        </article>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={BookOpen}
          value={subjects.length}
          label="Matérias no edital"
          detail="Conteúdo mapeado"
          color="#4F8EF7"
        />
        <MetricCard
          icon={CheckCircle2}
          value={done.length}
          label="Sessões concluídas"
          detail={`${pending.length} ainda planejadas`}
          color="#4FF7A0"
        />
        <MetricCard
          icon={Clock3}
          value={`${(totalMinutes / 60).toFixed(1)}h`}
          label="Horas estudadas"
          detail={`${Math.round(plannedMinutes / 60)}h no plano`}
          color="#F7C94F"
        />
        <MetricCard
          icon={Flame}
          value={streak}
          label="Sequência atual"
          detail={streak === 1 ? 'dia estudando' : 'dias estudando'}
          color="#FB923C"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <DashboardCard
          title="Ritmo dos últimos 7 dias"
          subtitle="Carga planejada e tempo realmente concluído"
          icon={TrendingUp}
          action={
            <Link
              href={`/cronograma?projeto=${project.id}&filtro=semana`}
              className="dashboard-text-link"
            >
              Ver semana <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <div className="mt-7 grid h-56 grid-cols-7 items-end gap-2 sm:gap-4">
            {week.map((day) => {
              const plannedHeight = Math.max(
                8,
                Math.round((day.planned / maxWeekMinutes) * 100),
              )
              const doneHeight = day.planned
                ? Math.round((day.done / maxWeekMinutes) * 100)
                : 0

              return (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-col items-center justify-end"
                >
                  <div className="relative flex w-full flex-1 items-end justify-center">
                    <div
                      className="absolute bottom-0 w-full max-w-10 rounded-t-xl bg-white/[0.055]"
                      style={{ height: `${plannedHeight}%` }}
                    />
                    <div
                      className="relative w-full max-w-10 rounded-t-xl bg-gradient-to-t from-atlas-500 to-atlas-violet shadow-[0_0_18px_rgba(79,142,247,.18)] transition-all duration-700"
                      style={{ height: `${doneHeight}%` }}
                      title={`${day.done} de ${day.planned} minutos`}
                    />
                  </div>
                  <span
                    className={`mt-3 text-[10px] font-bold uppercase ${
                      day.date === today ? 'text-atlas-400' : 'text-slate-600'
                    }`}
                  >
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-5 flex gap-5 border-t border-white/[0.07] pt-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-gradient-to-br from-atlas-400 to-atlas-violet" />
              Concluído
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-white/10" />
              Planejado
            </span>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Domínio por matéria"
          subtitle="Avanço calculado pelas sessões concluídas"
          icon={BookOpen}
        >
          {subjects.length ? (
            <div className="mt-6 space-y-5">
              {subjects.slice(0, 6).map((subject) => (
                <SubjectProgress
                  key={subject.id}
                  subject={subject}
                  tasks={tasks}
                />
              ))}
            </div>
          ) : (
            <Muted>Cadastre um edital com conteúdo programático.</Muted>
          )}
        </DashboardCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <DashboardCard
          title="Plano de hoje"
          subtitle={
            todayTasks.length
              ? `${todayTasks.length} sessões · ${todayPlannedMinutes} minutos planejados`
              : 'Nenhuma sessão programada'
          }
          icon={CalendarDays}
          action={
            <Link
              href={`/cronograma?projeto=${project.id}&filtro=hoje`}
              className="dashboard-text-link"
            >
              Abrir cronograma <ChevronRight className="size-3.5" />
            </Link>
          }
        >
          {todayTasks.length ? (
            <div className="mt-5 space-y-2">
              {todayTasks.slice(0, 6).map((task) => {
                const subject = subjects.find(
                  (item) => item.id === task.subject_id,
                )
                return (
                  <TaskRow key={task.id} task={task} subject={subject} />
                )
              })}
            </div>
          ) : (
            <Muted>
              Seu cronograma não reservou sessões para hoje. Você pode antecipar
              uma revisão ou descansar sem culpa.
            </Muted>
          )}
        </DashboardCard>

        <DashboardCard
          title="Revisões inteligentes"
          subtitle="Itens que precisam voltar à memória"
          icon={RefreshCcw}
          action={
            <Link
              href={`/revisoes?projeto=${project.id}`}
              className="dashboard-text-link"
            >
              Revisar agora <ChevronRight className="size-3.5" />
            </Link>
          }
        >
          {due.length ? (
            <div className="mt-5 space-y-3">
              {due.slice(0, 4).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-atlas-red/10 font-display text-xs font-bold text-atlas-red">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Intervalo atual: {item.interval_days} dia
                      {item.interval_days === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-atlas-green/15 bg-atlas-green/[0.05] p-5 text-center">
              <CheckCircle2 className="mx-auto size-7 text-atlas-green" />
              <p className="mt-3 text-sm font-bold">Memória em dia</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Nenhuma revisão vencida neste momento.
              </p>
            </div>
          )}
        </DashboardCard>
      </section>
    </div>
  )
}

function ProgressRing({
  progress,
  label,
  detail,
  size = 'large',
}: {
  progress: number
  label: string
  detail: string
  size?: 'large' | 'small'
}) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  const radius = size === 'large' ? 76 : 44
  const stroke = size === 'large' ? 12 : 8
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (safeProgress / 100) * circumference
  const dimension = size === 'large' ? 190 : 112

  return (
    <div
      className={`relative shrink-0 ${size === 'large' ? 'size-[190px]' : 'size-28'}`}
    >
      <svg
        viewBox={`0 0 ${dimension} ${dimension}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`ring-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4F8EF7" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="dashboard-ring-progress"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <strong
          className={`font-display font-extrabold tracking-[-0.05em] ${
            size === 'large' ? 'text-4xl' : 'text-2xl'
          }`}
        >
          {safeProgress}%
        </strong>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {size === 'large' ? (
          <span className="mt-2 text-[10px] text-slate-600">{detail}</span>
        ) : null}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  value,
  label,
  detail,
  color,
}: {
  icon: typeof BookOpen
  value: string | number
  label: string
  detail: string
  color: string
}) {
  return (
    <article className="dashboard-metric-card group">
      <div
        className="mb-5 flex size-10 items-center justify-center rounded-xl"
        style={{ color, backgroundColor: `${color}16` }}
      >
        <Icon className="size-[18px]" />
      </div>
      <p className="font-display text-[28px] font-extrabold leading-none tracking-[-0.04em]">
        {value}
      </p>
      <p className="mt-2 text-xs font-semibold text-slate-300">{label}</p>
      <p className="mt-1 text-[10px] text-slate-600">{detail}</p>
      <div
        className="absolute inset-x-0 bottom-0 h-0.5 opacity-60 transition-all group-hover:h-1"
        style={{ backgroundColor: color }}
      />
    </article>
  )
}

function DashboardCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string
  subtitle: string
  icon: typeof BookOpen
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="dashboard-panel">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400">
            <Icon className="size-[18px]" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold">{title}</h2>
            <p className="mt-1 text-[11px] text-slate-600">{subtitle}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function MissionCard({
  icon: Icon,
  label,
  title,
  detail,
  href,
  cta,
  tone,
}: {
  icon: typeof BookOpen
  label: string
  title: string
  detail: string
  href: string
  cta: string
  tone: 'blue' | 'red' | 'green' | 'yellow'
}) {
  const tones = {
    blue: 'border-atlas-400/20 bg-atlas-400/[0.06] text-atlas-400',
    red: 'border-atlas-red/20 bg-atlas-red/[0.07] text-atlas-red',
    green: 'border-atlas-green/20 bg-atlas-green/[0.06] text-atlas-green',
    yellow: 'border-atlas-yellow/20 bg-atlas-yellow/[0.07] text-atlas-yellow',
  }

  return (
    <Link
      href={href}
      className="group flex min-h-[210px] flex-col justify-between rounded-[22px] border border-white/10 bg-ink-900/70 p-4 transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.035]"
    >
      <div>
        <div className={`mb-4 flex size-11 items-center justify-center rounded-2xl border ${tones[tone]}`}>
          <Icon className="size-5" />
        </div>
        <p className="dashboard-eyebrow">{label}</p>
        <h4 className="mt-2 line-clamp-2 font-display text-base font-extrabold text-white">
          {title}
        </h4>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-atlas-400 transition group-hover:gap-2">
        {cta}
        <ArrowRight className="size-3.5" />
      </span>
    </Link>
  )
}

function RiskCard({
  riskLevel,
  overdueTasks,
  dueReviews,
  dueFlashcards,
  weakFlashcards,
  wrongQuestions,
  projectId,
}: {
  riskLevel: 'alto' | 'medio' | 'controlado'
  overdueTasks: number
  dueReviews: number
  dueFlashcards: number
  weakFlashcards: number
  wrongQuestions: number
  projectId: string
}) {
  const risk = {
    alto: {
      title: 'Semana em risco',
      detail: 'Ha atraso ou muitos erros recentes. Melhor fazer uma sessao curta agora do que tentar compensar tudo depois.',
      className: 'border-atlas-red/25 bg-atlas-red/[0.07] text-atlas-red',
    },
    medio: {
      title: 'Atencao ao acumulado',
      detail: 'Existem revisoes, cards ou blocos pedindo cuidado. Resolva uma prioridade por vez.',
      className: 'border-atlas-yellow/25 bg-atlas-yellow/[0.07] text-atlas-yellow',
    },
    controlado: {
      title: 'Plano sob controle',
      detail: 'Sem grandes gargalos agora. Mantenha consistencia e use questoes para medir dominio.',
      className: 'border-atlas-green/25 bg-atlas-green/[0.06] text-atlas-green',
    },
  }[riskLevel]

  return (
    <article className="dashboard-panel flex flex-col justify-between">
      <div>
        <div className={`mb-4 flex size-11 items-center justify-center rounded-2xl border ${risk.className}`}>
          <AlertTriangle className="size-5" />
        </div>
        <p className="dashboard-eyebrow">Radar da semana</p>
        <h3 className="mt-2 font-display text-xl font-extrabold text-white">{risk.title}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">{risk.detail}</p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <RiskPill icon={Clock3} value={overdueTasks} label="atrasadas" />
          <RiskPill icon={RefreshCcw} value={dueReviews} label="revisoes" />
          <RiskPill icon={Zap} value={dueFlashcards + weakFlashcards} label="cards" />
          <RiskPill icon={FileQuestion} value={wrongQuestions} label="erros" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link className="button-secondary" href={`/revisoes?projeto=${projectId}`}>
          <RefreshCcw className="size-4" />
          Revisar
        </Link>
        <Link className="button-secondary" href={`/simulados?projeto=${projectId}`}>
          <FileQuestion className="size-4" />
          Questoes
        </Link>
      </div>
    </article>
  )
}

function RiskPill({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BookOpen
  value: number
  label: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center gap-2 text-slate-500">
        <Icon className="size-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <strong className="font-display text-2xl font-extrabold text-white">{value}</strong>
    </div>
  )
}

function SubjectProgress({
  subject,
  tasks,
}: {
  subject: Subject
  tasks: StudyTask[]
}) {
  const subjectTasks = tasks.filter((item) => item.subject_id === subject.id)
  const completed = subjectTasks.filter((item) => item.status === 'done').length
  const progress = subjectTasks.length
    ? Math.round((completed / subjectTasks.length) * 100)
    : 0
  const color = subjectColor(subject.name)

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <span
          className="size-2.5 shrink-0 rounded-full shadow-[0_0_12px_currentColor]"
          style={{ backgroundColor: color, color }}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {subject.name}
        </span>
        <span className="font-display text-xs font-bold" style={{ color }}>
          {progress}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.055]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          }}
        />
      </div>
    </div>
  )
}

function TaskRow({
  task,
  subject,
}: {
  task: StudyTask
  subject: Subject | undefined
}) {
  const color = subjectColor(subject?.name ?? task.title)
  const complete = task.status === 'done'

  return (
    <div
      className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition ${
        complete
          ? 'border-atlas-green/10 bg-atlas-green/[0.025] opacity-55'
          : 'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      <span
        className="h-9 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{task.title}</p>
        <p className="mt-1 truncate text-[11px] text-slate-500">
          {task.notes} · {task.duration_min} min
        </p>
      </div>
      <form action={toggleTaskAction}>
        <input type="hidden" name="taskId" value={task.id} />
        <input
          type="hidden"
          name="status"
          value={complete ? 'pending' : 'done'}
        />
        <button
          className={`flex size-8 items-center justify-center rounded-full border-2 transition ${
            complete
              ? 'border-atlas-green bg-atlas-green text-ink-950'
              : 'border-white/15 text-transparent hover:border-atlas-green hover:text-atlas-green'
          }`}
          aria-label={complete ? 'Reabrir sessão' : 'Concluir sessão'}
        >
          <Check className="size-4" />
        </button>
      </form>
    </div>
  )
}

function HeroMetric({
  value,
  label,
}: {
  value: string | number
  label: string
}) {
  return (
    <div>
      <p className="font-display text-xl font-extrabold tracking-[-0.04em] text-white md:text-2xl">
        {value}
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-600">
        {label}
      </p>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm leading-6 text-slate-500">
      {children}
    </p>
  )
}

function buildWeek(tasks: StudyTask[], today: string) {
  const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysIso(today, index - 6)
    const dayTasks = tasks.filter((item) => item.scheduled_for === date)
    const day = new Date(`${date}T12:00:00Z`).getUTCDay()
    return {
      date,
      label: labels[day],
      planned: dayTasks.reduce((sum, item) => sum + item.duration_min, 0),
      done: dayTasks
        .filter((item) => item.status === 'done')
        .reduce((sum, item) => sum + item.duration_min, 0),
    }
  })
}

function calculateStreak(doneTasks: StudyTask[], today: string) {
  const completedDates = new Set(doneTasks.map((item) => item.scheduled_for))
  let cursor = today
  if (!completedDates.has(cursor)) cursor = addDaysIso(cursor, -1)
  let streak = 0
  while (completedDates.has(cursor)) {
    streak += 1
    cursor = addDaysIso(cursor, -1)
  }
  return streak
}
