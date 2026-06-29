import {
  createEmptyEditalExtraction,
  normalizeEditalExtraction,
  type EditalAiPayload,
  type EditalExtraction,
} from './schema.ts'

const dateRegex = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g
const currencyRegex = /R\$\s*[\d.]+(?:,\d{2})?/i
const urlRegex = /https?:\/\/[^\s)]+/i
const roleLineRegex =
  /^([A-ZÀ-Ú][A-Za-zÀ-ú0-9\s/().-]{3,80}?)(?:\s{2,}|\s-\s|\s\|\s)(\d{1,4}|CR)(?:\s{1,4}(R\$\s*[\d.]+(?:,\d{2})?))?/m

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function toLines(textContent: string): string[] {
  return textContent
    .split(/\r?\n/)
    .map((line) => compactWhitespace(line))
    .filter(Boolean)
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function findFirstMatchingLine(lines: string[], matcher: (line: string) => boolean): string | null {
  return lines.find(matcher) ?? null
}

function pickTitle(lines: string[], fallbackName: string): string | null {
  const preferred = findFirstMatchingLine(lines.slice(0, 25), (line) =>
    /edital|retifica|anexo|processo seletivo|concurso/i.test(line),
  )

  if (preferred) {
    return preferred
  }

  const firstLongLine = lines.find((line) => line.length >= 18 && line.length <= 160)
  return firstLongLine ?? fallbackName.replace(/\.[^.]+$/, '')
}

function findDateNearKeyword(textContent: string, keywords: string[]): string | null {
  const matcher = new RegExp(
    `(?:${keywords.join('|')})[^\\n\\r]{0,120}?(${dateRegex.source})`,
    'i',
  )

  return textContent.match(matcher)?.[1] ?? null
}

function findDateRangeNearKeyword(
  textContent: string,
  keywords: string[],
): { startDate: string | null; endDate: string | null } {
  const matcher = new RegExp(
    `(?:${keywords.join('|')})[^\\n\\r]{0,160}?(?:de\\s+)?(${dateRegex.source})[^\\n\\r]{0,20}?(?:ate|a|até)\\s+(${dateRegex.source})`,
    'i',
  )

  const match = textContent.match(matcher)

  return {
    startDate: match?.[1] ?? null,
    endDate: match?.[2] ?? null,
  }
}

function findCurrencyNearKeyword(textContent: string, keywords: string[]): string | null {
  const matcher = new RegExp(
    `(?:${keywords.join('|')})[^\\n\\r]{0,120}?(${currencyRegex.source})`,
    'i',
  )

  return textContent.match(matcher)?.[1] ?? null
}

function currencyToNumber(currency: string | null): number | null {
  if (!currency) {
    return null
  }

  const normalized = currency.replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : null
}

function findEvidence(textContent: string, keywords: string, field: string) {
  const matcher = new RegExp(`.{0,60}(?:${keywords}).{0,120}`, 'i')
  const excerpt = compactWhitespace(textContent.match(matcher)?.[0] ?? '')

  if (!excerpt) {
    return null
  }

  return {
    field,
    excerpt,
    page: null,
  }
}

export function buildHeuristicExtraction(payload: EditalAiPayload): EditalExtraction {
  const textContent = compactWhitespace(payload.textContent)
  const lines = toLines(payload.textContent)
  const extraction = createEmptyEditalExtraction(payload.classification.documentKind)

  if (textContent.length === 0) {
    extraction.warnings.push('Sem texto legível para heurística local.')
    extraction.confidence = 0.05
    return extraction
  }

  const summarySource = lines.slice(0, 6).join(' ')
  const registrationRange = findDateRangeNearKeyword(textContent, ['inscri[cç][aã]o', 'inscricoes', 'inscrições'])
  const examDate = findDateNearKeyword(textContent, ['prova', 'aplicacao da prova', 'aplicação da prova'])
  const resultDate = findDateNearKeyword(textContent, ['resultado', 'classificacao final', 'classificação final'])
  const exemptionDeadline = findDateNearKeyword(textContent, [
    'isencao',
    'isen[cç][aã]o',
    'pedido de isencao',
    'pedido de isenção',
  ])
  const feeText = findCurrencyNearKeyword(textContent, ['taxa', 'valor da inscricao', 'valor da inscrição'])
  const institutionLine = findFirstMatchingLine(lines.slice(0, 40), (line) =>
    /^prefeitura municipal de .+|^camara municipal de .+|^tribunal .+|^universidade .+|^governo do estado .+|^secretaria .+|^ministerio .+|^instituto federal .+/i.test(
      line,
    ),
  )
  const organizerLine = findFirstMatchingLine(lines, (line) =>
    /banca|organizadora|instituto|fundacao|fundação|fgv|vunesp|ibfc|fcc|cesgranrio/i.test(line),
  )
  const opportunities: EditalExtraction['opportunities'] = []
  const seenRoles = new Set<string>()

  for (const line of lines.slice(0, 240)) {
    const match = line.match(roleLineRegex)
    if (!match) {
      continue
    }

    const role = compactWhitespace(match[1])
    if (seenRoles.has(role.toLowerCase())) {
      continue
    }

    opportunities.push({
      role,
      specialty: null,
      vacancies: match[2].toUpperCase() === 'CR' ? null : Number.parseInt(match[2], 10),
      reserveVacancies: null,
      salary: compactWhitespace(match[3] ?? '') || null,
      workload: null,
      location: null,
      requirements: [],
    })
    seenRoles.add(role.toLowerCase())
  }

  const subjectsHeadingIndex = lines.findIndex((line) =>
    /conteudo programatico|conteúdo programático|disciplinas|materias cobradas|matérias cobradas/i.test(
      line,
    ),
  )
  const subjects =
    subjectsHeadingIndex >= 0
      ? [
          {
            role: null,
            topics: dedupeStrings(
              lines
                .slice(subjectsHeadingIndex + 1, subjectsHeadingIndex + 10)
                .flatMap((line) => line.split(/[;,-]/))
                .map((topic) => compactWhitespace(topic))
                .filter((topic) => topic.length >= 4),
            ).slice(0, 12),
          },
        ].filter((entry) => entry.topics.length > 0)
      : []

  extraction.title = pickTitle(lines, payload.fileName)
  extraction.summary = summarySource.length > 20 ? summarySource.slice(0, 320) : null
  extraction.institution = {
    name: institutionLine,
    acronym: null,
    city: null,
    state: institutionLine?.match(/\b([A-Z]{2})\b/)?.[1] ?? null,
  }
  extraction.organizer = {
    name: organizerLine,
    acronym: organizerLine?.match(/\b([A-Z]{2,10})\b/)?.[1] ?? null,
  }
  extraction.registration = {
    startDate: registrationRange.startDate,
    endDate: registrationRange.endDate,
    feeAmount: currencyToNumber(feeText),
    feeCurrency: 'BRL',
    feeNotes: feeText,
    exemptionDeadline,
    officialUrl: textContent.match(urlRegex)?.[0] ?? null,
  }
  extraction.exam = {
    examDate,
    resultDate,
    validity: findFirstMatchingLine(lines, (line) => /validade/i.test(line)),
    modality:
      findFirstMatchingLine(lines, (line) => /presencial|online|h[ií]brido|objetiva|discursiva/i.test(line)) ??
      null,
    educationLevel:
      findFirstMatchingLine(lines, (line) =>
        /nivel fundamental|nível fundamental|nivel medio|nível médio|nivel superior|nível superior/i.test(
          line,
        ),
      ) ?? null,
    locations: dedupeStrings(
      lines
        .filter((line) => /local de prova|cidade de aplicacao|cidade de aplicação|municipio/i.test(line))
        .flatMap((line) => line.split(/[:;-]/))
        .map((piece) => compactWhitespace(piece))
        .filter((piece) => piece.length >= 4),
    ).slice(0, 6),
  }
  extraction.opportunities = opportunities
  extraction.subjects = subjects
  extraction.attachments = lines
    .filter((line) => /^anexo\s+[ivxlcdm\d]+|^anexo\b/i.test(line))
    .slice(0, 10)
    .map((line) => ({
      label: line,
      description: null,
    }))
  extraction.timeline = [
    {
      label: 'Inscrições',
      date: null,
      startDate: registrationRange.startDate,
      endDate: registrationRange.endDate,
      notes: null,
    },
    {
      label: 'Pedido de isenção',
      date: exemptionDeadline,
      startDate: null,
      endDate: null,
      notes: null,
    },
    {
      label: 'Prova',
      date: examDate,
      startDate: null,
      endDate: null,
      notes: null,
    },
    {
      label: 'Resultado',
      date: resultDate,
      startDate: null,
      endDate: null,
      notes: null,
    },
  ].filter((event) => event.date || event.startDate || event.endDate)
  extraction.quotaNotes = dedupeStrings(
    lines
      .filter((line) => /cotas|pcd|negros|indigenas|indígenas|ampla concorrencia|ampla concorrência/i.test(line))
      .slice(0, 8),
  )
  extraction.evidence = [
    findEvidence(textContent, 'edital', 'title'),
    registrationRange.startDate ? findEvidence(textContent, 'inscri', 'registration') : null,
    feeText ? findEvidence(textContent, 'taxa', 'registration.feeAmount') : null,
    examDate ? findEvidence(textContent, 'prova', 'exam.examDate') : null,
    organizerLine ? findEvidence(textContent, 'banca|organizadora|instituto|fundacao', 'organizer') : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (payload.classification.isScannedCandidate) {
    extraction.warnings.push('Arquivo com características de digitalização; alguns campos podem estar incompletos.')
  }
  if (subjects.length === 0) {
    extraction.warnings.push('A heurística local não encontrou conteúdo programático estruturado.')
  }
  if (opportunities.length === 0) {
    extraction.warnings.push('A heurística local não conseguiu identificar cargos com segurança.')
  }

  const foundSignals = [
    extraction.title,
    extraction.institution.name,
    extraction.organizer.name,
    extraction.registration.startDate,
    extraction.registration.endDate,
    extraction.registration.feeAmount,
    extraction.exam.examDate,
    extraction.opportunities.length > 0 ? 'opportunities' : null,
    extraction.subjects.length > 0 ? 'subjects' : null,
  ].filter(Boolean).length

  extraction.confidence = Math.min(0.88, Math.max(0.18, foundSignals / 10))

  return normalizeEditalExtraction(extraction)
}
