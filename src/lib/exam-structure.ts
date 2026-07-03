import { z } from 'zod'

import { getExamBoardQuestionFormat, type ExamBoardFormat } from '@/lib/bancas'
import type { Json, Subject } from '@/lib/database.types'

export const examQuestionFormatSchema = z.enum([
  'multiple_choice_a_e',
  'multiple_choice_a_d',
  'true_false',
  'mixed',
  'unknown',
])

export const examStructureDisciplineSchema = z.object({
  name: z.string().trim().min(1),
  questionCount: z.number().int().min(0).nullable().default(null),
  weight: z.number().min(0).nullable().default(null),
  notes: z.string().trim().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.45),
})

export const examStructureSchema = z.object({
  totalQuestions: z.number().int().min(0).nullable().default(null),
  durationMinutes: z.number().int().min(0).nullable().default(null),
  format: examQuestionFormatSchema.default('unknown'),
  source: z.enum(['edital', 'manual', 'inferred']).default('inferred'),
  confidence: z.number().min(0).max(1).default(0.35),
  disciplines: z.array(examStructureDisciplineSchema).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
})

export type ExamQuestionFormat = z.infer<typeof examQuestionFormatSchema>
export type ExamStructure = z.infer<typeof examStructureSchema>
export type SimulationPlanItem = {
  subject: Subject
  questionCount: number
  topic: string
}

const DEFAULT_SIMULATION_SIZE = 30
const MAX_SYNC_SIMULATION_SIZE = 40

export function normalizeSubjectName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function formatFromBoard(board?: string | null): ExamQuestionFormat {
  const format = getExamBoardQuestionFormat(board)

  if (format === 'certo_errado') return 'true_false'
  if (format === 'multipla_escolha_a_d') return 'multiple_choice_a_d'
  return 'multiple_choice_a_e'
}

function firstTopic(subject: Subject) {
  if (Array.isArray(subject.syllabus)) {
    const topic = subject.syllabus.find((item): item is string =>
      typeof item === 'string' && item.trim().length >= 3,
    )
    if (topic) return topic.replace(/\s+/g, ' ').trim()
  }

  return subject.name
}

function readExtraction(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  return record.extraction && typeof record.extraction === 'object'
    ? record.extraction as Record<string, unknown>
    : record
}

export function extractExamStructure(value: unknown): ExamStructure | null {
  const extraction = readExtraction(value)
  if (!extraction) return null

  const candidates = [
    extraction.examStructure,
    extraction.prova,
    extraction.exam_matrix,
    extraction.examMatrix,
  ]

  for (const candidate of candidates) {
    const parsed = examStructureSchema.safeParse(candidate)
    if (parsed.success && parsed.data.disciplines.length) {
      return {
        ...parsed.data,
        source: parsed.data.source === 'inferred' ? 'edital' : parsed.data.source,
      }
    }
  }

  return null
}

export function inferExamStructure(subjects: Subject[], board?: string | null): ExamStructure {
  const activeSubjects = subjects.filter((subject) => subject.name.trim().length > 0)
  const totalWeight = activeSubjects.reduce((sum, subject) => sum + Math.max(1, subject.weight ?? subject.priority ?? 1), 0)
  const totalQuestions = Math.max(10, Math.min(DEFAULT_SIMULATION_SIZE, activeSubjects.length * 5 || DEFAULT_SIMULATION_SIZE))

  return examStructureSchema.parse({
    totalQuestions,
    durationMinutes: null,
    format: formatFromBoard(board),
    source: 'inferred',
    confidence: 0.35,
    disciplines: activeSubjects.map((subject) => {
      const weight = Math.max(1, subject.weight ?? subject.priority ?? 1)
      const share = totalWeight ? weight / totalWeight : 1 / activeSubjects.length

      return {
        name: subject.name,
        questionCount: Math.max(1, Math.round(totalQuestions * share)),
        weight,
        notes: 'Distribuicao estimada pelas materias e pesos cadastrados.',
        confidence: 0.35,
      }
    }),
    warnings: ['A estrutura da prova ainda nao foi confirmada no edital; usamos uma distribuicao estimada.'],
  })
}

export function resolveExamStructure(
  structuredData: unknown,
  subjects: Subject[],
  board?: string | null,
) {
  return extractExamStructure(structuredData) ?? inferExamStructure(subjects, board)
}

export function formatExamStructureLabel(structure: ExamStructure) {
  const formatLabel: Record<ExamQuestionFormat, string> = {
    multiple_choice_a_e: 'A-E',
    multiple_choice_a_d: 'A-D',
    true_false: 'Certo/Errado',
    mixed: 'Misto',
    unknown: 'Nao identificado',
  }

  return `${structure.totalQuestions ?? '?'} questoes · ${formatLabel[structure.format]}`
}

export function buildSimulationPlan(
  structure: ExamStructure,
  subjects: Subject[],
  maxQuestions = MAX_SYNC_SIMULATION_SIZE,
) {
  const subjectByName = new Map(subjects.map((subject) => [normalizeSubjectName(subject.name), subject]))
  const planned: SimulationPlanItem[] = []

  for (const discipline of structure.disciplines) {
    const subject = subjectByName.get(normalizeSubjectName(discipline.name))
    if (!subject) continue

    planned.push({
      subject,
      questionCount: Math.max(0, discipline.questionCount ?? 0),
      topic: firstTopic(subject),
    })
  }

  const fallback = planned.length ? planned : inferExamStructure(subjects).disciplines
    .map((discipline) => {
      const subject = subjectByName.get(normalizeSubjectName(discipline.name))
      return subject
        ? { subject, questionCount: discipline.questionCount ?? 1, topic: firstTopic(subject) }
        : null
    })
    .filter((item): item is SimulationPlanItem => Boolean(item))

  const total = fallback.reduce((sum, item) => sum + item.questionCount, 0)
  const scale = total > maxQuestions ? maxQuestions / total : 1
  const scaled = fallback
    .map((item) => ({
      ...item,
      questionCount: Math.max(1, Math.round(item.questionCount * scale)),
    }))
    .filter((item) => item.questionCount > 0)

  return {
    items: scaled,
    originalTotal: total,
    generatedTotal: scaled.reduce((sum, item) => sum + item.questionCount, 0),
    scaled: total > maxQuestions,
  }
}

export function jsonToUnknown(value: Json | unknown) {
  return value as unknown
}
