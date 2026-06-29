import type { Flashcard, MockQuestion, ReviewItem, Subject } from '@/lib/database.types'
import { syllabusTopics } from '@/lib/workspace'

export type FlashcardSuggestion = {
  subjectId: string
  subjectName: string
  topic: string
  reason: string
  score: number
}

export type FlashcardSubjectStats = {
  subjectId: string
  subjectName: string
  total: number
  due: number
  weak: number
  retention: number
}

function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function reviewTopic(title: string, subjectName: string) {
  return cleanText(
    title
      .replace(/^Revisar\s*/i, '')
      .replace(new RegExp(`\\s+em\\s+${subjectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), ''),
  )
}

function retention(cards: Flashcard[]) {
  const scored = cards.filter((card) => card.last_score !== null)
  if (!scored.length) return 0
  const remembered = scored.filter((card) => Number(card.last_score) >= 3).length
  return Math.round((remembered / scored.length) * 100)
}

export function buildFlashcardSubjectStats(input: {
  subjects: Subject[]
  cards: Flashcard[]
  today: string
}): FlashcardSubjectStats[] {
  return input.subjects
    .map((subject) => {
      const cards = input.cards.filter((card) => card.subject_id === subject.id)
      const due = cards.filter((card) => !card.next_review_at || card.next_review_at <= input.today)
      const weak = cards.filter((card) => card.last_score !== null && card.last_score <= 2)

      return {
        subjectId: subject.id,
        subjectName: subject.name,
        total: cards.length,
        due: due.length,
        weak: weak.length,
        retention: retention(cards),
      }
    })
    .filter((item) => item.total > 0)
    .sort((left, right) => right.due - left.due || right.weak - left.weak || left.retention - right.retention)
}

export function buildFlashcardSuggestions(input: {
  subjects: Subject[]
  wrongQuestions: MockQuestion[]
  reviews: ReviewItem[]
  cards: Flashcard[]
  today: string
}): FlashcardSuggestion[] {
  const suggestions = new Map<string, FlashcardSuggestion>()

  function add(subject: Subject, topic: string, reason: string, score: number) {
    const cleanTopic = cleanText(topic)
    if (cleanTopic.length < 3) return

    const key = `${subject.id}:${cleanTopic.toLowerCase()}`
    const current = suggestions.get(key)

    if (!current || current.score < score) {
      suggestions.set(key, {
        subjectId: subject.id,
        subjectName: subject.name,
        topic: cleanTopic,
        reason,
        score,
      })
    }
  }

  for (const subject of input.subjects) {
    const wrongByTopic = new Map<string, number>()

    input.wrongQuestions
      .filter((question) => question.subject_id === subject.id)
      .forEach((question) => {
        const topic = cleanText(question.topic)
        if (!topic) return
        wrongByTopic.set(topic, (wrongByTopic.get(topic) ?? 0) + 1)
      })

    for (const [topic, count] of wrongByTopic) {
      add(
        subject,
        topic,
        `${count} ${count === 1 ? 'erro recente' : 'erros recentes'} em simulados`,
        20 + count * 4,
      )
    }

    const subjectReviews = input.reviews.filter((review) => review.subject_id === subject.id)
    for (const review of subjectReviews) {
      add(subject, reviewTopic(review.title, subject.name), 'revisao vencida ou com baixa retencao', 16)
    }

    const weakCards = input.cards.filter(
      (card) =>
        card.subject_id === subject.id &&
        ((card.last_score !== null && card.last_score <= 2) ||
          !card.next_review_at ||
          card.next_review_at <= input.today),
    )
    const topics = syllabusTopics(subject)

    if (weakCards.length > 0 && topics[0]) {
      add(subject, topics[0], `${weakCards.length} card(s) fraco(s) ou vencido(s)`, 12 + weakCards.length)
    }

    for (const topic of topics.slice(0, 3)) {
      add(subject, topic, 'topico do edital ainda bom para memorizar', 6)
    }
  }

  return [...suggestions.values()].sort((left, right) => right.score - left.score).slice(0, 8)
}
