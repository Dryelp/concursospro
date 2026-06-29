import { ArrowUpRight, Brain, FileStack, Target, TimerReset } from 'lucide-react'

import { MetricCard } from '../../components/MetricCard'
import { SurfaceCard } from '../../components/SurfaceCard'
import type { ProjectSnapshot, StudyTaskSnapshot } from '../../lib/concurseiro-data'

type DashboardOverviewProps = {
  isAuthenticated: boolean
  dataLoading: boolean
  currentProject: ProjectSnapshot | null
  recentProjects: ProjectSnapshot[]
  studyTasks: StudyTaskSnapshot[]
  weeklyHours: number
  onSelectProject: (projectId: string) => Promise<void> | void
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h${minutes.toString().padStart(2, '0')}`
}

function formatExamDate(value: string | null): string {
  if (!value) {
    return 'Sem data'
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, (month || 1) - 1, day || 1)

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(parsed)
}

export function DashboardOverview({
  isAuthenticated,
  dataLoading,
  currentProject,
  recentProjects,
  studyTasks,
  weeklyHours,
  onSelectProject,
}: DashboardOverviewProps) {
  const plannedMinutes = studyTasks.reduce((total, task) => total + task.durationMin, 0)
  const readinessScore = Math.min(
    96,
    42 +
      recentProjects.length * 8 +
      studyTasks.length * 4 +
      (currentProject?.extractionStatus === 'ready' ? 10 : 0),
  )

  const metrics = [
    {
      label: 'Horas planejadas',
      value: plannedMinutes > 0 ? formatMinutes(plannedMinutes) : `${weeklyHours}h00`,
      change: currentProject ? 'Blocos iniciais ja distribuidos pelo cronograma' : 'Defina sua rotina para gerar o primeiro plano',
      icon: <TimerReset size={16} />,
    },
    {
      label: 'Leitura do edital',
      value: currentProject ? `${Math.round(currentProject.progress)}%` : '0%',
      change: currentProject
        ? currentProject.extractionStatus === 'ready'
          ? 'Extracao pronta para execucao'
          : 'Em revisao assistida'
        : 'Aguardando o primeiro envio',
      icon: <Brain size={16} />,
      tone: 'highlight' as const,
    },
    {
      label: 'Editais ativos',
      value: String(recentProjects.length),
      change:
        recentProjects.length > 0
          ? `${recentProjects[0].title} e o mais recente`
          : 'Nenhum concurso salvo ainda',
      icon: <FileStack size={16} />,
    },
    {
      label: 'Meta da semana',
      value: `${studyTasks.length} blocos`,
      change: currentProject ? `Prova ${formatExamDate(currentProject.examDate)}` : 'Entre e envie o primeiro edital',
      icon: <Target size={16} />,
    },
  ]

  const actionItems = currentProject
    ? [
        currentProject.summary ?? 'Resumo do edital disponivel para consolidar a estrategia.',
        studyTasks[0]
          ? `Proximo bloco: ${studyTasks[0].title}`
          : 'Cronograma aguardando a primeira rodada de tarefas.',
        currentProject.board
          ? `Banca em foco: ${currentProject.board}`
          : 'Banca ainda sem definicao forte na leitura atual.',
      ]
    : [
        'Envie o edital oficial para criar um projeto real no painel.',
        'Defina horas por semana e dias disponiveis antes de gerar o cronograma.',
        'Use login privado para isolar seu espaco do SaaS principal.',
      ]

  return (
    <section className="dashboard-overview">
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="app-grid app-grid--hero">
        <SurfaceCard
          eyebrow="Radar"
          title="Leitura executiva da sua semana"
          description="O painel cruza o estado do edital com os primeiros blocos de estudo para orientar a melhor decisao do dia."
          className="surface-card--hero"
        >
          <div className="hero-panel">
            <div className="hero-panel__score">
              <span className="hero-panel__score-label">Score de prontidao</span>
              <strong>{isAuthenticated ? readinessScore : '--'}</strong>
              <p>
                {dataLoading
                  ? 'Atualizando o painel com os dados do Supabase...'
                  : currentProject
                    ? 'Base inicial pronta para iterar sem perder rastreabilidade.'
                    : 'Comece pelo upload do edital para sair do zero com metodo.'}
              </p>
            </div>

            <div className="hero-panel__actions">
              {actionItems.map((item) => (
                <div key={item} className="check-row">
                  <span className="check-row__dot" />
                  <p>{item}</p>
                </div>
              ))}

              <button type="button" className="button button--primary">
                {currentProject ? 'Entrar em modo de execucao' : 'Preparar primeiro concurso'}
                <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          eyebrow="Acoes"
          title="Janela de decisao para hoje"
          description="Resumo compacto do que esta salvo no projeto ativo e do que merece sua atencao agora."
        >
          <div className="action-list">
            {(recentProjects.length > 0 ? recentProjects.slice(0, 3) : [null]).map((project, index) => (
              <button
                key={project?.id ?? `empty-${index}`}
                type="button"
                className={`action-list__item action-list__item--button${
                  project?.id === currentProject?.id ? ' action-list__item--active' : ''
                }`}
                disabled={!project}
                onClick={() => {
                  if (project) {
                    void onSelectProject(project.id)
                  }
                }}
              >
                <span className="badge badge--soft">
                  {project ? (project.extractionStatus === 'ready' ? 'Pronto' : 'Revisao') : 'Inicio'}
                </span>
                <strong>{project?.title ?? 'Seu primeiro concurso ainda nao foi salvo'}</strong>
                <p>
                  {project
                    ? `${project.board ?? 'Banca pendente'} • ${project.positionName ?? 'Cargo em definicao'}`
                    : 'Assim que voce fizer login e subir um edital, esta coluna passa a refletir dados reais.'}
                </p>
              </button>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </section>
  )
}
