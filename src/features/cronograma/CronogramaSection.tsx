import { CalendarClock, Check, Clock3, SkipForward } from 'lucide-react'

import { SurfaceCard } from '../../components/SurfaceCard'
import type { StudyTaskSnapshot } from '../../lib/concurseiro-data'

type CronogramaSectionProps = {
  tasks: StudyTaskSnapshot[]
  updatingTaskId: string | null
  onUpdateTaskStatus: (
    taskId: string,
    status: StudyTaskSnapshot['status'],
  ) => Promise<void> | void
}

function formatTaskDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function taskTypeLabel(type: StudyTaskSnapshot['taskType']): string {
  const labels: Record<StudyTaskSnapshot['taskType'], string> = {
    study: 'Estudo',
    revision: 'Revisao',
    questions: 'Questoes',
    mock: 'Simulado',
    material: 'Material',
  }

  return labels[type]
}

function statusLabel(status: StudyTaskSnapshot['status']): string {
  const labels: Record<StudyTaskSnapshot['status'], string> = {
    pending: 'Planejado',
    done: 'Concluido',
    skipped: 'Pulou',
    delayed: 'Adiado',
  }

  return labels[status]
}

export function CronogramaSection({
  tasks,
  updatingTaskId,
  onUpdateTaskStatus,
}: CronogramaSectionProps) {
  const agendaItems =
    tasks.length > 0
      ? tasks.slice(0, 6)
      : [
          {
            id: 'empty',
            title: 'O cronograma nasce depois do primeiro edital salvo',
            scheduledFor: '',
            durationMin: 0,
            taskType: 'study' as const,
            status: 'pending' as const,
            notes: 'Faca login, envie o edital e defina sua rotina para gerar os blocos iniciais.',
          },
        ]

  return (
    <SurfaceCard
      eyebrow="Cronograma"
      title="Ritmo semanal com foco no que move resultado"
      description="Uma agenda viva: conclua, adie ou pule blocos sem perder o fio da semana."
      className="surface-card--timeline"
    >
      <div className="timeline">
        {agendaItems.map((task) => {
          const isRealTask = task.id !== 'empty'
          const isBusy = updatingTaskId === task.id

          return (
            <article key={`${task.id}-${task.title}`} className="timeline__item">
              <div className="timeline__time">
                <CalendarClock size={16} />
                <span>{task.scheduledFor ? formatTaskDate(task.scheduledFor) : 'Aguardando'}</span>
              </div>
              <div className="timeline__content">
                <div className="timeline__header">
                  <strong>{task.title}</strong>
                  <span className="badge">{statusLabel(task.status)}</span>
                </div>
                <p>
                  {task.durationMin > 0
                    ? `${task.durationMin} min • ${taskTypeLabel(task.taskType)}`
                    : task.notes}
                </p>
                {task.notes && task.durationMin > 0 ? <p>{task.notes}</p> : null}
              </div>
              <div className="timeline__actions">
                <button
                  type="button"
                  className="icon-button icon-button--small"
                  aria-label="Concluir bloco"
                  disabled={!isRealTask || isBusy}
                  onClick={() => void onUpdateTaskStatus(task.id, 'done')}
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--small"
                  aria-label="Adiar bloco"
                  disabled={!isRealTask || isBusy}
                  onClick={() => void onUpdateTaskStatus(task.id, 'delayed')}
                >
                  <Clock3 size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--small"
                  aria-label="Pular bloco"
                  disabled={!isRealTask || isBusy}
                  onClick={() => void onUpdateTaskStatus(task.id, 'skipped')}
                >
                  <SkipForward size={16} />
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </SurfaceCard>
  )
}
