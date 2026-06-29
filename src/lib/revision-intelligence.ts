import type { Flashcard, MockQuestion, ReviewItem, StudyTask, Subject } from '@/lib/database.types'
import { syllabusTopics } from '@/lib/workspace'

export type RevisionInsight = {
  subjectName: string
  topic: string
  priority: 'Alta' | 'Media' | 'Leve'
  reasons: string[]
  checklist: string[]
  stats: {
    daysLate: number
    wrongQuestions: number
    weakFlashcards: number
  }
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function diffDays(left: string, right: string) {
  const leftTime = new Date(`${left}T12:00:00`).getTime()
  const rightTime = new Date(`${right}T12:00:00`).getTime()
  return Math.round((leftTime - rightTime) / 86_400_000)
}

function mostFrequentTopic(questions: MockQuestion[]) {
  const counts = new Map<string, number>()

  for (const question of questions) {
    const topic = normalizeText(question.topic)
    if (!topic) continue
    counts.set(topic, (counts.get(topic) ?? 0) + 1)
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ''
}

function isSameSubject(subjectId: string | null, value: { subject_id: string | null }) {
  return subjectId ? value.subject_id === subjectId : true
}

function readableTaskTitle(task: StudyTask | undefined) {
  if (!task) return ''
  return normalizeText(task.title.replace(/^(Estudo profundo|Revisao ativa|Questoes):\s*/i, ''))
}

export function buildReviewTitleFromTask(task: Pick<StudyTask, 'title' | 'notes'>) {
  const topic = usefulTaskNote(task.notes)
  const title = readableTaskTitle(task as StudyTask)

  if (topic && title) return `Revisar ${topic} em ${title}`
  if (topic) return `Revisar ${topic}`
  return `Revisar ${normalizeText(task.title)}`
}

function usefulTaskNote(value: string | null | undefined) {
  const note = normalizeText(value)
  if (/^(Bloco guiado|Reforco curto)/i.test(note)) return ''
  return note
}

export function buildRevisionInsight(input: {
  review: ReviewItem
  subjects: Subject[]
  tasks: StudyTask[]
  wrongQuestions: MockQuestion[]
  flashcards: Flashcard[]
  today: string
}): RevisionInsight {
  const { review, subjects, tasks, wrongQuestions, flashcards, today } = input
  const subject = subjects.find((item) => item.id === review.subject_id)
  const task = tasks.find((item) => item.id === review.study_task_id)
  const subjectName = subject?.name ?? readableTaskTitle(task) ?? 'Revisao geral'
  const subjectTopics = subject ? syllabusTopics(subject) : []
  const relatedWrongQuestions = wrongQuestions.filter((question) =>
    isSameSubject(review.subject_id, question),
  )
  const relatedFlashcards = flashcards.filter((card) => isSameSubject(review.subject_id, card))
  const weakFlashcards = relatedFlashcards.filter(
    (card) =>
      (card.last_score !== null && card.last_score <= 2) ||
      !card.next_review_at ||
      card.next_review_at <= today,
  )
  const missedTopic = mostFrequentTopic(relatedWrongQuestions)
  const taskTopic = usefulTaskNote(task?.notes)
  const topic =
    taskTopic ||
    missedTopic ||
    subjectTopics[0] ||
    normalizeText(review.title.replace(/^Revisar\s*/i, '')) ||
    subjectName
  const daysLate = Math.max(0, diffDays(today, review.next_review_at))
  const reasons: string[] = []

  if (daysLate > 0) {
    reasons.push(`Esta revisao esta ${daysLate} ${daysLate === 1 ? 'dia' : 'dias'} atrasada.`)
  } else {
    reasons.push('Esta revisao venceu hoje no ciclo de repeticao espacada.')
  }

  if (review.last_score !== null && review.last_score <= 2) {
    reasons.push('A ultima tentativa foi dificil, entao o intervalo voltou a ficar curto.')
  }

  if (relatedWrongQuestions.length > 0) {
    reasons.push(
      `${relatedWrongQuestions.length} ${relatedWrongQuestions.length === 1 ? 'erro recente aponta' : 'erros recentes apontam'} esta materia como prioridade.`,
    )
  }

  if (weakFlashcards.length > 0) {
    reasons.push(
      `${weakFlashcards.length} ${weakFlashcards.length === 1 ? 'flashcard fraco/vencido precisa' : 'flashcards fracos/vencidos precisam'} de reforco.`,
    )
  }

  const checklist = [
    `Revise o topico: ${topic}.`,
    'Explique em voz alta a regra central, as excecoes e um exemplo pratico.',
    relatedWrongQuestions.length > 0
      ? 'Refaca as questoes que errou e anote o motivo do erro antes de olhar o gabarito.'
      : 'Resolva 3 a 5 questoes curtas desse topico para testar retencao.',
    weakFlashcards.length > 0
      ? 'Passe pelos flashcards vencidos e marque como dificil tudo que ainda estiver inseguro.'
      : 'Feche com um mini-resumo de 5 linhas para consolidar a memoria.',
  ]

  const score =
    daysLate * 2 +
    relatedWrongQuestions.length * 3 +
    weakFlashcards.length * 2 +
    (review.last_score !== null && review.last_score <= 2 ? 4 : 0)
  const priority = score >= 8 ? 'Alta' : score >= 3 ? 'Media' : 'Leve'

  return {
    subjectName,
    topic,
    priority,
    reasons: reasons.slice(0, 4),
    checklist,
    stats: {
      daysLate,
      wrongQuestions: relatedWrongQuestions.length,
      weakFlashcards: weakFlashcards.length,
    },
  }
}
