import { describe, expect, it } from 'vitest'

import type { Subject } from '@/lib/database.types'
import { deterministicSchedule, inferDailyStudyHours, sm2 } from '@/lib/study'

const subject: Subject = {
  id: 'subject-1',
  project_id: 'project-1',
  user_id: 'user-1',
  name: 'Direito Constitucional',
  weight: 3,
  priority: 5,
  origin: 'extracted',
  source_pages: [],
  confidence: 0.9,
  topic_count: 2,
  mastery: 0,
  syllabus: ['Direitos fundamentais', 'Organização do Estado'],
  created_at: '',
  updated_at: '',
}

describe('sm2', () => {
  it('reinicia o intervalo quando a nota é baixa', () => {
    expect(sm2(2.5, 12, 4, 2).interval).toBe(1)
  })

  it('expande o intervalo em uma boa revisão', () => {
    const result = sm2(2.5, 6, 2, 5)
    expect(result.interval).toBeGreaterThan(6)
    expect(result.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('deterministicSchedule', () => {
  it('gera blocos apenas nos dias selecionados', () => {
    const result = deterministicSchedule({
      subjects: [subject],
      start: '2026-06-22',
      days: [1, 3, 5],
      dailyHours: 2,
      totalDays: 7,
    })
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((item) => [1, 3, 5].includes(new Date(`${item.date}T12:00:00`).getDay()))).toBe(true)
  })

  it('distribui a carga por horas diarias', () => {
    const result = deterministicSchedule({
      subjects: [subject],
      start: '2026-06-22',
      days: [1],
      dailyHours: 2,
      totalDays: 1,
    })
    const minutes = result.reduce((sum, item) => sum + item.duration, 0)
    expect(minutes).toBe(120)
  })

  it('mantem domingo como dia 7', () => {
    const result = deterministicSchedule({
      subjects: [subject],
      start: '2026-06-28',
      days: [7],
      dailyHours: 1,
      totalDays: 1,
    })
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('inferDailyStudyHours', () => {
  it('converte valores legados semanais em horas por dia', () => {
    expect(inferDailyStudyHours(12, [1, 2, 3, 4, 5])).toBe(2)
  })
})
