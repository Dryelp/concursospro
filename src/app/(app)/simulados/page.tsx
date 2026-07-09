import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileQuestion,
  ListFilter,
  Percent,
  Target,
  X,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'

import { SectionEmpty } from '@/components/section-empty'
import { FullSimulationGenerator } from '@/app/(app)/simulados/full-simulation-generator'
import {
  SimulationGenerator,
  type SimulationSubjectOption,
} from '@/app/(app)/simulados/generator'
import { QuestionList } from '@/app/(app)/simulados/question-list'
import type { MockQuestion, MockSimulation, Subject } from '@/lib/database.types'
import { normalizeSubjectName, resolveExamStructure, type ExamStructure } from '@/lib/exam-structure'
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
type SimulationStatsQuestion = Pick<MockQuestion, 'simulation_id' | 'is_correct' | 'answered_at'>

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

function subjectSyllabus(subject: Subject): string[] {
  return Array.isArray(subject.syllabus)
    ? subject.syllabus.filter((topic): topic is string => typeof topic === 'string')
    : []
}

function isStudyTopic(value: string | null | undefined): value is string {
  const topic = value?.trim() ?? ''
  if (topic.length < 4) return false

  return !/^\d+(?:[,.]\d+)?\s*(?:pontos?|quest(?:ao|oes|ões))$/i.test(topic) &&
    !/^(?:pontos?|pontuacao|pontuação|valor|nota)\b/i.test(topic)
}

function buildSimulationSubjects(
  subjects: Subject[],
  examStructure: ExamStructure,
): SimulationSubjectOption[] {
  const options: SimulationSubjectOption[] = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    syllabus: subjectSyllabus(subject),
  }))
  const existingNames = new Set(options.map((subject) => normalizeSubjectName(subject.name)))

  for (const discipline of examStructure.disciplines) {
    const key = normalizeSubjectName(discipline.name)
    if (!key || existingNames.has(key)) continue

    const relatedSubject = subjects.find((subject) => {
      const subjectKey = normalizeSubjectName(subject.name)
      return subjectKey.includes(key) || key.includes(subjectKey)
    })
    const relatedTopics = relatedSubject ? subjectSyllabus(relatedSubject) : []

    options.push({
      id: `matrix:${key}`,
      name: discipline.name,
      syllabus: relatedTopics.length
        ? relatedTopics
        : [discipline.notes].filter(isStudyTopic),
      isVirtual: true,
      questionCount: discipline.questionCount,
    })
    existingNames.add(key)
  }

  return options
}

function simulationStatusLabel(status: MockSimulation['status']) {
  const labels: Record<MockSimulation['status'], string> = {
    generating: 'Gerando',
    not_started: 'Pronto',
    in_progress: 'Em andamento',
    completed: 'Finalizado',
    failed: 'Falhou',
  }

  return labels[status]
}

function simulationStatusTone(status: MockSimulation['status']) {
  if (status === 'completed') return 'border-atlas-green/20 bg-atlas-green/10 text-atlas-green'
  if (status === 'failed') return 'border-atlas-red/20 bg-atlas-red/10 text-atlas-red'
  if (status === 'in_progress') return 'border-atlas-yellow/20 bg-atlas-yellow/10 text-atlas-yellow'
  return 'border-atlas-400/20 bg-atlas-400/10 text-atlas-300'
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

function ModeCard({
  icon: Icon,
  title,
  description,
  detail,
}: {
  icon: typeof CircleHelp
  title: string
  description: string
  detail: string
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-4 flex size-10 items-center justify-center rounded-2xl bg-atlas-400/10 text-atlas-300">
        <Icon className="size-5" />
      </div>
      <strong className="block font-display text-base text-white">{title}</strong>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {detail}
      </span>
    </div>
  )
}

export default async function SimuladosPage({
  searchParams,
}: {
  searchParams: { projeto?: string; simulado?: string }
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
    { data: extractionRows },
    { data: simulationRows },
    { data: simulationStatsRows },
    { data: activeSimulationRows },
  ] = await Promise.all([
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .is('answered_at', null)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .not('answered_at', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(100),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .not('answered_at', 'is', null),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .eq('is_correct', true),
    supabase
      .from('mock_questions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .is('answered_at', null),
    supabase
      .from('mock_questions')
      .select('subject_id, is_correct')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .is('simulation_id', null)
      .not('answered_at', 'is', null)
      .limit(5000),
    supabase
      .from('edital_extraction_runs')
      .select('structured_data')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('mock_simulations')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('mock_questions')
      .select('simulation_id, is_correct, answered_at')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .not('simulation_id', 'is', null)
      .limit(5000),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', user.id)
      .eq('simulation_id', searchParams.simulado ?? '00000000-0000-0000-0000-000000000000')
      .order('simulation_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  const pending = (pendingRows ?? []) as MockQuestion[]
  const answered = (answeredRows ?? []) as MockQuestion[]
  const answeredTotal = answeredCount ?? answered.length
  const correct = correctCount ?? answered.filter((item) => item.is_correct).length
  const wrong = Math.max(0, answeredTotal - correct)
  const accuracy = percent(correct, answeredTotal)
  const pendingTotal = pendingCount ?? pending.length
  const performance = buildPerformance(subjects, (answeredStatsRows ?? []) as SubjectStatsRow[])
  const structuredData = Array.isArray(extractionRows) ? extractionRows[0]?.structured_data : null
  const examStructure = resolveExamStructure(structuredData, subjects, project.board)
  const simulationSubjects = buildSimulationSubjects(subjects, examStructure)
  const simulations = (simulationRows ?? []) as MockSimulation[]
  const simulationStats = (simulationStatsRows ?? []) as SimulationStatsQuestion[]
  const activeSimulation = simulations.find((simulation) => simulation.id === searchParams.simulado) ?? null
  const activeSimulationQuestions = (activeSimulationRows ?? []) as MockQuestion[]
  const activeAnswered = activeSimulationQuestions.filter((question) => question.answered_at).length
  const activeCorrect = activeSimulationQuestions.filter((question) => question.is_correct).length
  const activeTotal = activeSimulation?.total_questions || activeSimulationQuestions.length
  const activeProgress = percent(activeAnswered, activeTotal)

  return (
    <div className="dashboard-reveal space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="dashboard-eyebrow">Central de questões</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-white">
            Simulados
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Gere questões por tópico, monte uma prova proporcional ao edital e
            acompanhe onde está ganhando ou perdendo pontos.
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

      <section className="dashboard-panel grid gap-4 md:grid-cols-3">
        <ModeCard
          icon={ListFilter}
          title="Gerar por filtro"
          description="Escolha matéria, quantidade e assunto obrigatório para uma bateria rápida."
          detail="Tópico do edital"
        />
        <ModeCard
          icon={FileQuestion}
          title="Simulado da prova"
          description="Usa a estrutura detectada do edital para distribuir questões por disciplina."
          detail={examStructure.source === 'edital' ? 'Matriz do edital' : 'Matriz estimada'}
        />
        <ModeCard
          icon={BookOpenCheck}
          title="Acompanhar desempenho"
          description="Veja acertos, erros e matérias que precisam de revisão antes da prova."
          detail={`${accuracy}% de acerto`}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {simulationSubjects.length ? (
            <div className="space-y-5">
              <SimulationGenerator
                projectId={project.id}
                projectBoard={project.board}
                subjects={simulationSubjects}
                recentQuestions={[...pending, ...answered].map((question) => ({
                  subject_id: question.subject_id,
                  topic: question.topic,
                  statement: question.statement,
                }))}
              />
              <QuestionList
                questions={pending}
                examBoard={project.board}
                eyebrow="Banco de questões"
                title="Questões pendentes"
                description="Questões ainda sem resposta deste concurso."
                emptyTitle="Nenhuma questão pendente"
                emptyDescription="Gere questões por matéria e tópico para começar uma nova bateria."
              />
            </div>
          ) : (
            <SectionEmpty
              title="Nenhuma matéria encontrada"
              description="Adicione conteúdo programático ao edital."
            />
          )}
        </div>

        <aside className="space-y-5">
          <FullSimulationGenerator
            projectId={project.id}
            examStructure={examStructure}
          />

          <section className="dashboard-panel">
            <p className="dashboard-eyebrow">Provas isoladas</p>
            <h3 className="mt-1 font-display text-lg font-extrabold text-white">
              Simulados gerados
            </h3>
            <div className="mt-5 space-y-3">
              {simulations.length ? (
                simulations.map((simulation) => {
                  const rows = simulationStats.filter((question) => question.simulation_id === simulation.id)
                  const answeredSimulationQuestions = rows.filter((question) => question.answered_at).length
                  const correctSimulationQuestions = rows.filter((question) => question.is_correct).length
                  const totalSimulationQuestions = simulation.total_questions || rows.length
                  const progress = percent(answeredSimulationQuestions, totalSimulationQuestions)
                  const href = `/simulados?projeto=${project.id}&simulado=${simulation.id}`

                  return (
                    <Link
                      key={simulation.id}
                      href={href}
                      className={`block rounded-2xl border p-4 transition hover:border-atlas-400/50 hover:bg-white/[0.045] ${activeSimulation?.id === simulation.id ? 'border-atlas-400/40 bg-atlas-400/10' : 'border-white/10 bg-white/[0.03]'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm text-white">{simulation.title}</strong>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock3 className="size-3.5" />
                            {simulation.duration_minutes ? `${simulation.duration_minutes} min` : 'Tempo a confirmar'}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${simulationStatusTone(simulation.status)}`}>
                          {simulationStatusLabel(simulation.status)}
                        </span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-atlas-400"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>{answeredSimulationQuestions}/{totalSimulationQuestions} respondidas</span>
                        <span>{answeredSimulationQuestions ? `${percent(correctSimulationQuestions, answeredSimulationQuestions)}% acerto` : 'Nao iniciado'}</span>
                      </div>
                    </Link>
                  )
                })
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm leading-6 text-slate-500">
                  Nenhum simulado completo gerado ainda. Gere a primeira prova usando a matriz do edital.
                </p>
              )}
            </div>
          </section>

          <section className="dashboard-panel">
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
                  Responda algumas questões para o mapa mostrar seus pontos
                  fortes e fracos.
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>

      {activeSimulation ? (
        <div className="fixed inset-0 z-50 bg-ink-950/85 px-3 py-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-ink-950 shadow-2xl shadow-black/50">
            <header className="border-b border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="dashboard-eyebrow">Simulado completo</p>
                  <h3 className="mt-1 truncate font-display text-xl font-extrabold text-white sm:text-2xl">
                    {activeSimulation.title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Prova isolada, ordenada pela matriz do edital. As respostas daqui nao se misturam com a fila de questoes por topico.
                  </p>
                </div>
                <Link
                  href={`/simulados?projeto=${project.id}`}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-atlas-400/40 hover:text-white"
                  aria-label="Fechar simulado"
                >
                  <X className="size-5" />
                </Link>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-4">
                  <p className="dashboard-eyebrow">Progresso</p>
                  <strong className="mt-1 block text-2xl text-white">{activeProgress}%</strong>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-atlas-400" style={{ width: `${activeProgress}%` }} />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-4">
                  <p className="dashboard-eyebrow">Respondidas</p>
                  <strong className="mt-1 block text-2xl text-white">
                    {activeAnswered}/{activeTotal}
                  </strong>
                  <p className="mt-2 text-xs text-slate-500">Total esperado da prova.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-4">
                  <p className="dashboard-eyebrow">Acerto parcial</p>
                  <strong className="mt-1 block text-2xl text-white">
                    {activeAnswered ? `${percent(activeCorrect, activeAnswered)}%` : '0%'}
                  </strong>
                  <p className="mt-2 text-xs text-slate-500">
                    {activeCorrect} acertos registrados.
                  </p>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <QuestionList
                questions={activeSimulationQuestions}
                examBoard={project.board}
                eyebrow="Prova em andamento"
                title="Questões do simulado"
                description="Responda na ordem da prova. A explicacao permanece visivel depois da resposta."
                emptyTitle="Simulado sem questoes"
                emptyDescription="Se a geracao falhou, crie um novo simulado completo pela matriz do edital."
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
