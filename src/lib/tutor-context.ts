import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  Database,
  ExamProject,
  Flashcard,
  Material,
  MockQuestion,
  ReviewItem,
  StudyTask,
  Subject,
} from '@/lib/database.types'
import { todayIso } from '@/lib/format'
import { syllabusTopics } from '@/lib/workspace'

type TutorContextInput = {
  supabase: SupabaseClient<Database>
  userId: string
  project: ExamProject
}

type TopicStats = {
  subjectName: string
  topic: string
  total: number
  correct: number
  wrong: number
}

function percent(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

function compactList(values: string[], fallback: string, limit = 8) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  if (!cleaned.length) return fallback
  return cleaned.slice(0, limit).join('; ')
}

function subjectNameMap(subjects: Subject[]) {
  return new Map(subjects.map((subject) => [subject.id, subject.name]))
}

function buildSubjectPerformance(subjects: Subject[], questions: MockQuestion[]) {
  return subjects
    .map((subject) => {
      const answered = questions.filter((question) => question.subject_id === subject.id)
      const correct = answered.filter((question) => question.is_correct).length

      return {
        name: subject.name,
        total: answered.length,
        correct,
        wrong: answered.length - correct,
        accuracy: percent(correct, answered.length),
      }
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
    .map((item) => `${item.name}: ${item.correct}/${item.total} (${item.accuracy}%, ${item.wrong} erros)`)
    .slice(0, 8)
}

function buildWeakTopics(subjects: Subject[], questions: MockQuestion[]) {
  const names = subjectNameMap(subjects)
  const grouped = new Map<string, TopicStats>()

  for (const question of questions) {
    const topic = question.topic?.trim()
    if (!topic) continue

    const subjectName = question.subject_id
      ? names.get(question.subject_id) ?? 'Materia nao identificada'
      : 'Materia nao identificada'
    const key = `${subjectName}::${topic.toLowerCase()}`
    const current = grouped.get(key) ?? {
      subjectName,
      topic,
      total: 0,
      correct: 0,
      wrong: 0,
    }

    current.total += 1
    if (question.is_correct) current.correct += 1
    else current.wrong += 1
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .filter((item) => item.total >= 1 && item.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || percent(a.correct, a.total) - percent(b.correct, b.total))
    .slice(0, 8)
    .map((item) => {
      const accuracy = percent(item.correct, item.total)
      return `${item.subjectName} > ${item.topic}: ${item.wrong}/${item.total} erros (${accuracy}% acerto)`
    })
}

function buildTodayTasks(tasks: StudyTask[], today: string) {
  const todayTasks = tasks.filter((task) => task.scheduled_for === today)
  const done = todayTasks.filter((task) => task.status === 'done')
  const pending = todayTasks.filter((task) => task.status !== 'done')

  return {
    summary: `${done.length}/${todayTasks.length} blocos concluidos hoje`,
    pending: pending.map((task) => `${task.title} (${task.duration_min} min, ${task.task_type})`),
  }
}

function buildUpcomingTasks(tasks: StudyTask[], today: string) {
  return tasks
    .filter((task) => task.status !== 'done' && task.scheduled_for >= today)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))
    .slice(0, 6)
    .map((task) => `${task.scheduled_for}: ${task.title} (${task.duration_min} min)`)
}

function buildDueReviews(reviews: ReviewItem[], today: string) {
  const due = reviews.filter(
    (review) => review.status === 'active' && review.next_review_at <= today,
  )

  return {
    count: due.length,
    titles: due
      .sort((a, b) => a.next_review_at.localeCompare(b.next_review_at))
      .slice(0, 6)
      .map((review) => `${review.title} (score ${review.last_score ?? 'novo'})`),
  }
}

function buildFlashcardSignal(flashcards: Flashcard[], today: string) {
  const due = flashcards.filter(
    (card) => !card.suspended && (!card.next_review_at || card.next_review_at <= today),
  )
  const lowScores = flashcards.filter(
    (card) => typeof card.last_score === 'number' && Number(card.last_score) <= 2,
  )

  return {
    dueCount: due.length,
    lowScoreCount: lowScores.length,
  }
}

export async function buildStudentContextForTutor({
  supabase,
  userId,
  project,
}: TutorContextInput) {
  const today = todayIso()
  const [
    { data: subjectRows },
    { data: questionRows },
    { data: taskRows },
    { data: reviewRows },
    { data: flashcardRows },
    { data: materialRows },
  ] = await Promise.all([
    supabase
      .from('subjects')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .order('priority', { ascending: false }),
    supabase
      .from('mock_questions')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .not('answered_at', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(160),
    supabase
      .from('study_tasks')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .order('scheduled_for')
      .limit(120),
    supabase
      .from('review_items')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('next_review_at')
      .limit(80),
    supabase
      .from('flashcards')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .eq('suspended', false)
      .order('updated_at', { ascending: false })
      .limit(120),
    supabase
      .from('materials')
      .select('*')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const subjects = (subjectRows ?? []) as Subject[]
  const questions = (questionRows ?? []) as MockQuestion[]
  const tasks = (taskRows ?? []) as StudyTask[]
  const reviews = (reviewRows ?? []) as ReviewItem[]
  const flashcards = (flashcardRows ?? []) as Flashcard[]
  const materials = (materialRows ?? []) as Material[]

  const correct = questions.filter((question) => question.is_correct).length
  const wrong = questions.length - correct
  const todayTasks = buildTodayTasks(tasks, today)
  const dueReviews = buildDueReviews(reviews, today)
  const flashcardSignal = buildFlashcardSignal(flashcards, today)
  const weakTopics = buildWeakTopics(subjects, questions)
  const subjectPerformance = buildSubjectPerformance(subjects, questions)
  const upcomingTasks = buildUpcomingTasks(tasks, today)

  const subjectLines = subjects.map((subject) => {
    const topics = syllabusTopics(subject)
    return `${subject.name}${topics.length ? ` (${topics.slice(0, 5).join(', ')})` : ''}`
  })

  return [
    'Use estes dados reais do aluno para orientar respostas. Nao invente metricas ausentes.',
    'Quando o aluno pedir o que estudar, priorize topicos fracos, revisoes vencidas e tarefas do dia.',
    'Nao exponha IDs internos nem diga que acessou banco de dados; fale como mentor pessoal.',
    '',
    `Concurso: ${project.title}`,
    `Cargo: ${project.position_name ?? 'nao informado'}`,
    `Banca: ${project.board ?? 'nao informada'}`,
    `Data da prova: ${project.exam_date ?? 'nao informada'}`,
    `Resumo do edital: ${project.summary ?? 'sem resumo cadastrado'}`,
    `Materias e topicos-base: ${compactList(subjectLines, 'nenhuma materia cadastrada', 10)}`,
    '',
    `Questoes respondidas: ${questions.length}`,
    `Acertos: ${correct}`,
    `Erros: ${wrong}`,
    `Aproveitamento geral: ${percent(correct, questions.length)}%`,
    `Desempenho por materia: ${compactList(subjectPerformance, 'sem questoes respondidas por materia')}`,
    `Topicos mais frageis: ${compactList(weakTopics, 'ainda sem padrao de erro detectado')}`,
    '',
    `Hoje: ${todayTasks.summary}`,
    `Pendencias de hoje: ${compactList(todayTasks.pending, 'nenhum bloco pendente hoje', 6)}`,
    `Proximos blocos: ${compactList(upcomingTasks, 'cronograma sem proximos blocos', 6)}`,
    `Revisoes vencidas: ${dueReviews.count}`,
    `Itens de revisao urgentes: ${compactList(dueReviews.titles, 'nenhuma revisao vencida', 6)}`,
    `Flashcards vencidos: ${flashcardSignal.dueCount}`,
    `Flashcards com baixa retencao recente: ${flashcardSignal.lowScoreCount}`,
    `Materiais recentes: ${compactList(materials.map((material) => material.title), 'nenhum material gerado', 6)}`,
  ].join('\n')
}
