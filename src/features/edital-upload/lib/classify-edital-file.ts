import {
  editalDocumentKindValues,
  editalFileClassificationSchema,
  type EditalDocumentKind,
  type EditalFileClassification,
  type EditalFileFormat,
} from '../../../lib/ai/edital-schema'

export interface ClassifyEditalFileInput {
  fileName: string
  mimeType?: string | null
  fileSizeBytes?: number | null
  textPreview?: string | null
}

const extensionToFormat: Record<string, EditalFileFormat> = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  tif: 'image',
  tiff: 'image',
  bmp: 'image',
  svg: 'image',
  txt: 'text',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  doc: 'doc',
  docx: 'doc',
  rtf: 'doc',
  odt: 'doc',
}

const kindKeywords: Record<EditalDocumentKind, string[]> = {
  edital_abertura: [
    'edital',
    'abertura',
    'concurso publico',
    'processo seletivo',
    'seleção publica',
  ],
  retificacao: ['retificacao', 'retificado', 'corrigido', 'errata'],
  anexo: ['anexo', 'apendice'],
  cronograma: ['cronograma', 'calendario', 'datas importantes'],
  conteudo_programatico: ['conteudo programatico', 'disciplinas', 'materias', 'conteudo das provas'],
  resultado: ['resultado final', 'resultado preliminar', 'classificacao final', 'classificacao preliminar'],
  desconhecido: [],
}

function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function getFileExtension(fileName: string): string | null {
  const normalized = fileName.trim()
  const lastDot = normalized.lastIndexOf('.')
  if (lastDot < 0 || lastDot === normalized.length - 1) {
    return null
  }

  return normalized.slice(lastDot + 1).toLowerCase()
}

function inferFormat(extension: string | null, mimeType?: string | null): EditalFileFormat {
  if (extension && extension in extensionToFormat) {
    return extensionToFormat[extension]
  }

  const normalizedMimeType = (mimeType ?? '').toLowerCase()
  if (normalizedMimeType.includes('pdf')) {
    return 'pdf'
  }
  if (normalizedMimeType.startsWith('image/')) {
    return 'image'
  }
  if (normalizedMimeType.includes('html')) {
    return 'html'
  }
  if (normalizedMimeType.includes('markdown')) {
    return 'markdown'
  }
  if (normalizedMimeType.startsWith('text/')) {
    return 'text'
  }
  if (
    normalizedMimeType.includes('word') ||
    normalizedMimeType.includes('officedocument') ||
    normalizedMimeType.includes('rtf')
  ) {
    return 'doc'
  }

  return 'unknown'
}

export function classifyEditalFile(input: ClassifyEditalFileInput): EditalFileClassification {
  const extension = getFileExtension(input.fileName)
  const format = inferFormat(extension, input.mimeType)
  const normalizedName = normalizeForSearch(input.fileName)
  const normalizedPreview = normalizeForSearch(input.textPreview ?? '')
  const combined = `${normalizedName} ${normalizedPreview}`.trim()
  const reasons = new Set<string>()

  if (format !== 'unknown') {
    reasons.add(`Formato inferido como ${format}.`)
  }

  const scoreEntries = editalDocumentKindValues
    .filter((kind) => kind !== 'desconhecido')
    .map((kind) => {
      const keywords = kindKeywords[kind]
      const hits = keywords.filter((keyword) => combined.includes(keyword))

      if (hits.length > 0) {
        reasons.add(`Sinais de ${kind}: ${hits.join(', ')}.`)
      }

      const score = hits.length * (normalizedPreview.length > 0 ? 1.15 : 1)
      return [kind, score] as const
    })

  const [bestKind, bestScore] = scoreEntries.sort((left, right) => right[1] - left[1])[0] ?? [
    'desconhecido',
    0,
  ]

  if (combined.includes('concurso') || combined.includes('processo seletivo')) {
    reasons.add('Vocabulário típico de seleção pública detectado.')
  }

  const isScannedCandidate =
    format === 'pdf' &&
    (normalizedPreview.length === 0 ||
      normalizedPreview.length < 120 ||
      /digitalizado|escaneado|imagem/.test(normalizedPreview))

  if (isScannedCandidate) {
    reasons.add('PDF com pouco texto legível; pode exigir OCR ou visão.')
  }

  const isEditalLike =
    bestScore > 0 ||
    combined.includes('edital') ||
    combined.includes('concurso') ||
    combined.includes('processo seletivo')

  const confidenceBase =
    (bestScore > 0 ? 0.4 : 0) +
    (isEditalLike ? 0.2 : 0) +
    (format !== 'unknown' ? 0.15 : 0) +
    (normalizedPreview.length >= 200 ? 0.15 : 0) +
    (normalizedName.length >= 8 ? 0.05 : 0)

  const confidence = Math.min(0.98, Math.max(0.1, confidenceBase))

  return editalFileClassificationSchema.parse({
    fileName: input.fileName,
    mimeType: input.mimeType ?? null,
    extension,
    format,
    documentKind: isEditalLike ? bestKind : 'desconhecido',
    isEditalLike,
    isScannedCandidate,
    confidence,
    reasons: [...reasons],
  })
}
