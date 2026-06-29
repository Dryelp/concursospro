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
  const nextInterval =
    nextRepetitions === 1
      ? 1
      : nextRepetitions === 2
        ? 6
        : Math.max(1, Math.round(interval * nextEase))

  return { ease: nextEase, interval: nextInterval, repetitions: nextRepetitions }
}

export function inferDailyStudyHours(value: number, studyDays: number[] = [1, 2, 3, 4, 5]) {
  const safeValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 2
  const safeDays = Math.max(1, studyDays.length)

  // Legacy data used this same DB column as weekly hours. Convert high values
  // so an old "12h/semana" profile becomes roughly "2h/dia".
  if (safeValue > 8) {
    return Math.max(1, Math.min(12, Math.round(safeValue / safeDays)))
  }

  return Math.max(1, Math.min(12, safeValue))
}

export function deterministicSchedule(input: {
  subjects: Subject[]
  start: string
  days: number[]
  dailyHours?: number
  weeklyHours?: number
  totalDays?: number
}) {
  const rows: Array<{
    subject: Subject
    date: string
    title: string
    notes: string
    duration: number
    type: 'study' | 'questions' | 'revision'
  }> = []

  if (!input.subjects.length) return rows

  const dailyHours = input.dailyHours ?? inferDailyStudyHours(input.weeklyHours ?? 2, input.days)
  const dailyMinutes = dailyHours * 60
  const totalDays = input.totalDays ?? 21
  let cursor = input.start
  let slot = 0

  for (let index = 0; index < totalDays; index += 1) {
    const date = new Date(`${cursor}T12:00:00`)
    const weekDay = date.getDay() === 0 ? 7 : date.getDay()

    if (input.days.includes(weekDay)) {
      let plannedMinutes = 0
      let daySlot = 0

      while (plannedMinutes < dailyMinutes) {
        const subject = input.subjects[slot % input.subjects.length]
        const topics = syllabusTopics(subject)
        const topic = topics[slot % Math.max(1, topics.length)] ?? subject.name
        const remaining = dailyMinutes - plannedMinutes
        const type = daySlot % 4 === 2 ? 'questions' : daySlot % 4 === 3 ? 'revision' : 'study'
        const duration =
          remaining <= 45
            ? remaining
            : type === 'study'
            ? Math.min(90, Math.max(45, remaining))
            : Math.min(45, Math.max(30, remaining))
        const title =
          type === 'questions'
            ? `Questoes: ${subject.name}`
            : type === 'revision'
              ? `Revisao ativa: ${subject.name}`
              : `Estudo profundo: ${subject.name}`

        rows.push({ subject, date: cursor, title, notes: topic, duration, type })
        plannedMinutes += duration
        slot += 1
        daySlot += 1
      }
    }

    cursor = addDaysIso(cursor, 1)
  }

  return rows
}
