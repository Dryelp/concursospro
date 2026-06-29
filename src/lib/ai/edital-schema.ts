import { z } from 'zod'

const blankToNull = (value: unknown) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim()
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return value
}

const integerOrNull = (value: unknown) => {
  const normalized = numberOrNull(value)
  if (normalized === null || typeof normalized !== 'number') {
    return normalized
  }

  return Math.trunc(normalized)
}

const nullableStringSchema = z.preprocess(blankToNull, z.string().nullable()).default(null)
const nullableNumberSchema = z
  .preprocess(numberOrNull, z.number().min(0).nullable())
  .default(null)
const nullableIntegerSchema = z
  .preprocess(integerOrNull, z.number().int().min(0).nullable())
  .default(null)
const confidenceSchema = z
  .preprocess(numberOrNull, z.number().min(0).max(1))
  .default(0.1)

export const editalDocumentKindValues = [
  'edital_abertura',
  'retificacao',
  'anexo',
  'cronograma',
  'conteudo_programatico',
  'resultado',
  'desconhecido',
] as const

export const editalFileFormatValues = [
  'pdf',
  'image',
  'html',
  'markdown',
  'text',
  'doc',
  'unknown',
] as const

export const extractionProviderValues = [
  'gemini',
  'openrouter',
  'heuristic',
  'none',
] as const

const institutionSchema = z
  .object({
    name: nullableStringSchema,
    acronym: nullableStringSchema,
    city: nullableStringSchema,
    state: nullableStringSchema,
  })
  .default({
    name: null,
    acronym: null,
    city: null,
    state: null,
  })

const organizerSchema = z
  .object({
    name: nullableStringSchema,
    acronym: nullableStringSchema,
  })
  .default({
    name: null,
    acronym: null,
  })

const registrationSchema = z
  .object({
    startDate: nullableStringSchema,
    endDate: nullableStringSchema,
    feeAmount: nullableNumberSchema,
    feeCurrency: z.literal('BRL').default('BRL'),
    feeNotes: nullableStringSchema,
    exemptionDeadline: nullableStringSchema,
    officialUrl: nullableStringSchema,
  })
  .default({
    startDate: null,
    endDate: null,
    feeAmount: null,
    feeCurrency: 'BRL',
    feeNotes: null,
    exemptionDeadline: null,
    officialUrl: null,
  })

const examSchema = z
  .object({
    examDate: nullableStringSchema,
    resultDate: nullableStringSchema,
    validity: nullableStringSchema,
    modality: nullableStringSchema,
    educationLevel: nullableStringSchema,
    locations: z.array(z.string().trim().min(1)).default([]),
  })
  .default({
    examDate: null,
    resultDate: null,
    validity: null,
    modality: null,
    educationLevel: null,
    locations: [],
  })

const opportunitySchema = z.object({
  role: z.string().trim().min(1),
  specialty: nullableStringSchema,
  vacancies: nullableIntegerSchema,
  reserveVacancies: nullableIntegerSchema,
  salary: nullableStringSchema,
  workload: nullableStringSchema,
  location: nullableStringSchema,
  requirements: z.array(z.string().trim().min(1)).default([]),
})

const subjectSchema = z.object({
  role: nullableStringSchema,
  topics: z.array(z.string().trim().min(1)).default([]),
})

const timelineEventSchema = z.object({
  label: z.string().trim().min(1),
  date: nullableStringSchema,
  startDate: nullableStringSchema,
  endDate: nullableStringSchema,
  notes: nullableStringSchema,
})

const attachmentSchema = z.object({
  label: z.string().trim().min(1),
  description: nullableStringSchema,
})

const evidenceSchema = z.object({
  field: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  page: nullableIntegerSchema,
})

const editalFileDataSchema = z.object({
  mimeType: z.string().trim().min(1),
  base64: z.string().trim().min(1),
})

export const editalFileClassificationSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: nullableStringSchema,
  extension: nullableStringSchema,
  format: z.enum(editalFileFormatValues).default('unknown'),
  documentKind: z.enum(editalDocumentKindValues).default('desconhecido'),
  isEditalLike: z.boolean().default(false),
  isScannedCandidate: z.boolean().default(false),
  confidence: confidenceSchema,
  reasons: z.array(z.string().trim().min(1)).default([]),
})

export const editalExtractionSchema = z.object({
  documentKind: z.enum(editalDocumentKindValues).default('desconhecido'),
  title: nullableStringSchema,
  summary: nullableStringSchema,
  institution: institutionSchema,
  organizer: organizerSchema,
  registration: registrationSchema,
  exam: examSchema,
  opportunities: z.array(opportunitySchema).default([]),
  quotaNotes: z.array(z.string().trim().min(1)).default([]),
  subjects: z.array(subjectSchema).default([]),
  timeline: z.array(timelineEventSchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  evidence: z.array(evidenceSchema).default([]),
  confidence: confidenceSchema,
})

export const editalAiPayloadSchema = z.object({
  fileName: z.string().trim().min(1),
  mimeType: nullableStringSchema,
  fileSizeBytes: nullableIntegerSchema,
  textContent: z.string().default(''),
  textPreview: z.string().default(''),
  fileData: editalFileDataSchema.nullable().default(null),
  classification: editalFileClassificationSchema,
  heuristicExtraction: editalExtractionSchema.nullable().default(null),
}).refine((payload) => payload.textContent.trim().length > 0 || Boolean(payload.fileData), {
  message: 'Envie texto extraido ou dados do arquivo para leitura por visao.',
})

export const editalAiRequestSchema = z.object({
  action: z.literal('extract_edital'),
  payload: editalAiPayloadSchema,
})

export const editalAiResponseSchema = z.object({
  provider: z.enum(extractionProviderValues).default('none'),
  model: nullableStringSchema,
  usedFallback: z.boolean().default(false),
  warnings: z.array(z.string().trim().min(1)).default([]),
  extraction: editalExtractionSchema,
})

export type EditalDocumentKind = z.infer<typeof editalFileClassificationSchema>['documentKind']
export type EditalFileFormat = z.infer<typeof editalFileClassificationSchema>['format']
export type EditalFileClassification = z.infer<typeof editalFileClassificationSchema>
export type EditalExtraction = z.infer<typeof editalExtractionSchema>
export type EditalAiPayload = z.infer<typeof editalAiPayloadSchema>
export type EditalAiRequest = z.infer<typeof editalAiRequestSchema>
export type EditalAiResponse = z.infer<typeof editalAiResponseSchema>

export const createEmptyEditalExtraction = (
  documentKind: EditalDocumentKind = 'desconhecido',
): EditalExtraction =>
  editalExtractionSchema.parse({
    documentKind,
  })

export const normalizeEditalExtraction = (value: unknown): EditalExtraction =>
  editalExtractionSchema.parse(value)

export const editalExtractionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    documentKind: {
      type: 'string',
      enum: editalDocumentKindValues,
    },
    title: {
      type: ['string', 'null'],
    },
    summary: {
      type: ['string', 'null'],
    },
    institution: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: ['string', 'null'] },
        acronym: { type: ['string', 'null'] },
        city: { type: ['string', 'null'] },
        state: { type: ['string', 'null'] },
      },
      required: ['name', 'acronym', 'city', 'state'],
    },
    organizer: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: ['string', 'null'] },
        acronym: { type: ['string', 'null'] },
      },
      required: ['name', 'acronym'],
    },
    registration: {
      type: 'object',
      additionalProperties: false,
      properties: {
        startDate: { type: ['string', 'null'] },
        endDate: { type: ['string', 'null'] },
        feeAmount: { type: ['number', 'null'] },
        feeCurrency: { type: 'string', enum: ['BRL'] },
        feeNotes: { type: ['string', 'null'] },
        exemptionDeadline: { type: ['string', 'null'] },
        officialUrl: { type: ['string', 'null'] },
      },
      required: [
        'startDate',
        'endDate',
        'feeAmount',
        'feeCurrency',
        'feeNotes',
        'exemptionDeadline',
        'officialUrl',
      ],
    },
    exam: {
      type: 'object',
      additionalProperties: false,
      properties: {
        examDate: { type: ['string', 'null'] },
        resultDate: { type: ['string', 'null'] },
        validity: { type: ['string', 'null'] },
        modality: { type: ['string', 'null'] },
        educationLevel: { type: ['string', 'null'] },
        locations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [
        'examDate',
        'resultDate',
        'validity',
        'modality',
        'educationLevel',
        'locations',
      ],
    },
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: 'string' },
          specialty: { type: ['string', 'null'] },
          vacancies: { type: ['integer', 'null'] },
          reserveVacancies: { type: ['integer', 'null'] },
          salary: { type: ['string', 'null'] },
          workload: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          requirements: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: [
          'role',
          'specialty',
          'vacancies',
          'reserveVacancies',
          'salary',
          'workload',
          'location',
          'requirements',
        ],
      },
    },
    quotaNotes: {
      type: 'array',
      items: { type: 'string' },
    },
    subjects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: ['string', 'null'] },
          topics: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['role', 'topics'],
      },
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          date: { type: ['string', 'null'] },
          startDate: { type: ['string', 'null'] },
          endDate: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
        },
        required: ['label', 'date', 'startDate', 'endDate', 'notes'],
      },
    },
    attachments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          description: { type: ['string', 'null'] },
        },
        required: ['label', 'description'],
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          excerpt: { type: 'string' },
          page: { type: ['integer', 'null'] },
        },
        required: ['field', 'excerpt', 'page'],
      },
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
  },
  required: [
    'documentKind',
    'title',
    'summary',
    'institution',
    'organizer',
    'registration',
    'exam',
    'opportunities',
    'quotaNotes',
    'subjects',
    'timeline',
    'attachments',
    'warnings',
    'evidence',
    'confidence',
  ],
} as const
