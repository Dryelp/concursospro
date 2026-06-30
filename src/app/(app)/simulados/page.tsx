import {
  BarChart3,
  CheckCircle2,
  CircleHelp,
  Percent,
  Target,
  XCircle,
} from 'lucide-react'

import { SectionEmpty } from '@/components/section-empty'
import { SimulationGenerator } from '@/app/(app)/simulados/generator'
import { QuestionList } from '@/app/(app)/simulados/question-list'
import type { MockQuestion, Subject } from '@/lib/database.types'
import { subjectColor } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'

type SubjectPerformance = {
  id: string
  name: string
  total: number
  correct: number
  wrong: number
  percent: number
}

type SubjectStatsRow = Pick<MockQuestion, 'subject_id' | 'is_correct'>

function percent(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function buildPerformance(subjects: Subject[], answered: SubjectStatsRow[]) {
  return subjects
    .map<SubjectPerformance>((subject) => {
      const questions = answered.filter((item) => item.subject_id === subject.id)
      const correct = questions.filter((item) => item.is_correct).length

      return {
        id: subject.id,
        name: subject.name,
        total: questions.length,
        correct,
        wrong: questions.length - correct,
        percent: percent(correct, questions.length),
      }
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total || a.percent - b.percent)
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'text-atlas-400',
}: {
  icon: typeof CircleHelp
  label: string
  value: string
  detail: string
  tone?: string
}) {
  return (
    <div className="dashboard-metric-card">
      <div className={`mb-4 flex size-10 items-center justify-center rounded-2xl bg-white/5 ${tone}`}>
        <Icon className="size-5" />
      </div>
      <p className="dashboard-eyebrow">{label}</p>
      <strong className="mt-2 block font-display text-3xl font-extrabold text-white">
        {value}
      </strong>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}

export default async function SimuladosPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(
    searchParams.projeto,
  )

  if (!project) {
    return (
      <SectionEmpty
        title="Sem concurso ativo"
        description="Adicione um edital antes de gerar simulados."
      />
    )
  }

  const [
    { data: pendingRows },
    { data: answeredRows },
    { count: answeredCount },
    { count: correctCount },
    { count: pendingCount },
    { data: answeredStatsRows },
  ] = await Promise.all([
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('answered_at', null)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .not('answered_at', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(100),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .not('answered_at', 'is', null),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('is_correct', true),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('answered_at', null),
    supabase
      .from('mock_questions')
      .select('subject_id, is_correct')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .not('answered_at', 'is', null)
      .limit(5000),
  ])

  const pending = (pendingRows ?? []) as MockQuestion[]
  const answered = (answeredRows ?? []) as MockQuestion[]
  const answeredTotal = answeredCount ?? answered.length
  const correct = correctCount ?? answered.filter((item) => item.is_correct).length
  const wrong = Math.max(0, answeredTotal - correct)
  const accuracy = percent(correct, answeredTotal)
  const pendingTotal = pendingCount ?? pending.length
  const performance = buildPerformance(subjects, (answeredStatsRows ?? []) as SubjectStatsRow[])

  return (
    <div className="dashboard-reveal space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="dashboard-eyebrow">Banco de questões</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
            Simulados
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Gere questões por tópico, responda em ciclos curtos e acompanhe onde
            está ganhando ou perdendo pontos.
          </p>
        </div>
        <span className="dashboard-chip">
          <Target className="size-3.5" />
          {project.title}
        </span>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={CircleHelp}
          label="Resolvidas"
          value={String(answeredTotal)}
          detail="Questões respondidas até agora."
        />
        <MetricCard
          icon={CheckCircle2}
          label="Acertos"
          value={String(correct)}
          detail="Respostas corretas registradas."
          tone="text-atlas-green"
        />
        <MetricCard
          icon={XCircle}
          label="Erros"
          value={String(wrong)}
          detail="Pontos para revisar com prioridade."
          tone="text-atlas-red"
        />
        <MetricCard
          icon={Percent}
          label="Aproveitamento"
          value={`${accuracy}%`}
          detail="Percentual geral de acerto."
        />
        <MetricCard
          icon={BarChart3}
          label="Pendentes"
          value={String(pendingTotal)}
          detail="Questões aguardando resposta."
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_.85fr]">
        <div>
          {subjects.length ? (
            <SimulationGenerator
              projectId={project.id}
              projectBoard={project.board}
              subjects={subjects}
              recentQuestions={[...pending, ...answered].map((question) => ({
                subject_id: question.subject_id,
                topic: question.topic,
                statement: question.statement,
              }))}
            />
          ) : (
            <SectionEmpty
              title="Nenhuma matéria encontrada"
              description="Adicione conteúdo programático ao edital."
            />
          )}
        </div>

        <aside className="dashboard-panel">
          <p className="dashboard-eyebrow">Por matéria</p>
          <h3 className="mt-1 font-display text-lg font-extrabold text-white">
            Mapa de acerto
          </h3>
          <div className="mt-5 space-y-4">
            {performance.length ? (
              performance.map((item) => (
                <div key={item.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 flex-1 truncate font-bold text-slate-200">{item.name}</span>
                    <span className="shrink-0 font-semibold text-slate-500">
                      {item.correct}/{item.total} · {item.percent}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: subjectColor(item.name),
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {item.wrong} {item.wrong === 1 ? 'erro' : 'erros'} para
                    revisar.
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-slate-500">
                Responda algumas questões para o mapa mostrar seus pontos fortes
                e fracos.
              </p>
            )}
          </div>
        </aside>
      </section>

      <QuestionList
        questions={pending}
        examBoard={project.board}
        title="Simulado atual"
        description="Questões ainda sem resposta deste concurso."
        emptyTitle="Nenhuma questão pendente"
        emptyDescription="Gere questões por matéria e tópico para começar uma nova bateria."
      />
    </div>
  )
}
