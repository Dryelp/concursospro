import type { MockQuestion, StudyTask, Subject } from '@/lib/database.types'
import { subjectColor } from '@/lib/format'
import { syllabusTopics } from '@/lib/workspace'

export type MasteryLevel = 'iniciante' | 'intermediario' | 'avancado'

export type CycleSession = {
  id: string
  subject: Subject
  subjectName: string
  topic: string
  type: 'study' | 'questions' | 'revision'
  duration: number
  color: string
  reason: string
  completed: boolean
}

export type SubjectPlanSummary = {
  subject: Subject
  level: MasteryLevel
  score: number
  totalMinutes: number
  completedMinutes: number
  wrongQuestions: number
  color: string
}

export function masteryLevel(value: number | null | undefined): MasteryLevel {
  const mastery = Number.isFinite(value) ? Number(value) : 0
  if (mastery >= 70) return 'avancado'
  if (mastery >= 35) return 'intermediario'
  return 'iniciante'
}

export function masteryValue(level: string) {
  if (level === 'avancado') return 80
  if (level === 'intermediario') return 50
  return 15
}

export function masteryLabel(level: MasteryLevel) {
  const labels: Record<MasteryLevel, string> = {
    iniciante: 'Iniciante',
    intermediario: 'Intermediário',
    avancado: 'Avançado',
  }
  return labels[level]
}

function normalizeTopic(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function subjectWrongCount(subject: Subject, wrongQuestions: MockQuestion[]) {
  return wrongQuestions.filter((question) => question.subject_id === subject.id).length
}

function subjectMinutes(subject: Subject, tasks: StudyTask[], status?: StudyTask['status']) {
  return tasks
    .filter((task) => task.subject_id === subject.id)
    .filter((task) => (status ? task.status === status : true))
    .reduce((total, task) => total + task.duration_min, 0)
}

export function buildSubjectPlanSummaries(
  subjects: Subject[],
  tasks: StudyTask[],
  wrongQuestions: MockQuestion[],
) {
  return subjects
    .map<SubjectPlanSummary>((subject) => {
      const level = masteryLevel(subject.mastery)
      const wrongQuestionsCount = subjectWrongCount(subject, wrongQuestions)
      const weight = subject.weight ?? subject.priority ?? 1
      const levelBoost = level === 'iniciante' ? 34 : level === 'intermediario' ? 18 : 6
      const score = weight * 10 + wrongQuestionsCount * 8 + levelBoost

      return {
        subject,
        level,
        score,
        totalMinutes: subjectMinutes(subject, tasks),
        completedMinutes: subjectMinutes(subject, tasks, 'done'),
        wrongQuestions: wrongQuestionsCount,
        color: subjectColor(subject.name),
      }
    })
    .sort((left, right) => right.score - left.score)
}

export function buildCycleSessions(
  summaries: SubjectPlanSummary[],
  tasks: StudyTask[],
  limit = 16,
): CycleSession[] {
  const pendingTasks = tasks.filter((task) => task.status !== 'done')
  const sessions: CycleSession[] = []
  let pointer = 0

  while (sessions.length < limit && summaries.length) {
    const summary = summaries[pointer % summaries.length]
    const subject = summary.subject
    const topics = syllabusTopics(subject)
    const topic = normalizeTopic(
      topics[(sessions.length + pointer) % Math.max(1, topics.length)] ??
        pendingTasks.find((task) => task.subject_id === subject.id)?.notes ??
        subject.name,
    )
    const step = sessions.length % 5
    const type: CycleSession['type'] =
      summary.level === 'avancado'
        ? step === 0 || step === 3 ? 'questions' : step === 4 ? 'revision' : 'study'
        : summary.level === 'intermediario'
          ? step === 2 ? 'questions' : step === 4 ? 'revision' : 'study'
          : step === 3 ? 'questions' : step === 4 ? 'revision' : 'study'
    const duration = type === 'study'
      ? summary.level === 'iniciante' ? 50 : 45
      : type === 'questions'
        ? 30
        : 25
    const task = pendingTasks.find(
      (item) => item.subject_id === subject.id && item.task_type === type,
    )
    const reason = summary.wrongQuestions > 0
      ? `${summary.wrongQuestions} erro${summary.wrongQuestions === 1 ? '' : 's'} recente${summary.wrongQuestions === 1 ? '' : 's'} puxaram prioridade.`
      : summary.level === 'iniciante'
        ? 'Base declarada como iniciante: mais teoria e revisão curta.'
        : summary.level === 'avancado'
          ? 'Domínio avançado: mais questões e manutenção.'
          : 'Domínio intermediário: equilíbrio entre teoria e prática.'

    sessions.push({
      id: task?.id ?? `${subject.id}-${sessions.length}`,
      subject,
      subjectName: subject.name,
      topic,
      type,
      duration,
      color: summary.color,
      reason,
      completed: Boolean(task && task.status === 'done'),
    })
    pointer += 1
  }

  return sessions
}

export function typeLabel(type: CycleSession['type']) {
  const labels: Record<CycleSession['type'], string> = {
    study: 'Teoria',
    questions: 'Questões',
    revision: 'Revisão',
  }
  return labels[type]
}

export function cycleProgress(tasks: StudyTask[]) {
  if (!tasks.length) return { completed: 0, total: 0, percent: 0 }
  const completed = tasks.filter((task) => task.status === 'done').length
  return {
    completed,
    total: tasks.length,
    percent: Math.round((completed / tasks.length) * 100),
  }
}
