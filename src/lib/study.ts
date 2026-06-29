import type { Subject } from '@/lib/database.types'
import { syllabusTopics } from '@/lib/workspace'

export function addDaysIso(base: string, days: number) {
  const date = new Date(`${base}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function sm2(ease: number, interval: number, repetitions: number, score: number) {
  const nextEase = Math.max(1.3, ease + (0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)))
  if (score < 3) return { ease: nextEase, interval: 1, repetitions: 0 }
  const nextRepetitions = repetitions + 1
  const nextInterval = nextRepetitions === 1 ? 1 : nextRepetitions === 2 ? 6 : Math.max(1, Math.round(interval * nextEase))
  return { ease: nextEase, interval: nextInterval, repetitions: nextRepetitions }
}

export function deterministicSchedule(input: {
  subjects: Subject[]
  start: string
  days: number[]
  weeklyHours: number
  totalDays?: number
}) {
  const rows: Array<{ subject: Subject; date: string; title: string; notes: string; duration: number; type: 'study' | 'questions' | 'revision' }> = []
  if (!input.subjects.length) return rows
  const duration = input.weeklyHours <= 10 ? 60 : 90
  const totalDays = input.totalDays ?? 21
  let cursor = input.start
  let slot = 0
  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(`${cursor}T12:00:00`)
    const weekDay = date.getDay() === 0 ? 7 : date.getDay()
    if (input.days.includes(weekDay)) {
      const subject = input.subjects[slot % input.subjects.length]
      const topics = syllabusTopics(subject)
      const topic = topics[slot % Math.max(1, topics.length)] ?? subject.name
      rows.push({ subject, date: cursor, title: `Estudo profundo: ${subject.name}`, notes: topic, duration, type: slot % 4 === 3 ? 'questions' : 'study' })
      if (slot % 2 === 1) rows.push({ subject, date: cursor, title: `Revisão ativa: ${subject.name}`, notes: topic, duration: 30, type: 'revision' })
      slot += 1
    }
    cursor = addDaysIso(cursor, 1)
  }
  return rows
}
