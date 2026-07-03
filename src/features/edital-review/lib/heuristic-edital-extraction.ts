import {
  createEmptyEditalExtraction,
  normalizeEditalExtraction,
  type EditalExtraction,
  type EditalFileClassification,
} from '../../../lib/ai/edital-schema'

export interface ExtractEditalHeuristicallyInput {
  textContent: string
  fileName: string
  classification?: EditalFileClassification | null
}

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

function findEvidence(textContent: string, keyword: string, field: string) {
  const matcher = new RegExp(`.{0,60}(?:${keyword}).{0,120}`, 'i')
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

function extractInstitution(lines: string[]) {
  const candidates = [
    /^prefeitura municipal de .+/i,
    /^camara municipal de .+/i,
    /^tribunal .+/i,
    /^universidade .+/i,
    /^governo do estado .+/i,
    /^secretaria .+/i,
    /^ministerio .+/i,
    /^instituto federal .+/i,
  ]

  const line = findFirstMatchingLine(lines.slice(0, 40), (entry) =>
    candidates.some((pattern) => pattern.test(entry)),
  )

  if (!line) {
    return { name: null, acronym: null, city: null, state: null }
  }

  const stateMatch = line.match(/\b([A-Z]{2})\b/)

  return {
    name: line,
    acronym: null,
    city: null,
    state: stateMatch?.[1] ?? null,
  }
}

function extractOrganizer(lines: string[]) {
  const organizerLine = findFirstMatchingLine(lines, (line) =>
    /banca|organizadora|instituto|fundacao|fundação|fgv|vunesp|ibfc|fcc|cesgranrio/i.test(line),
  )

  if (!organizerLine) {
    return { name: null, acronym: null }
  }

  const nameMatch =
    organizerLine.match(
      /(instituto\s+[A-Za-zÀ-ú\s]+|funda[cç][aã]o\s+[A-Za-zÀ-ú\s]+|FGV|VUNESP|IBFC|FCC|CESGRANRIO)/i,
    )?.[1] ?? organizerLine

  const acronymMatch = nameMatch.match(/\b([A-Z]{2,10})\b/)

  return {
    name: compactWhitespace(nameMatch),
    acronym: acronymMatch?.[1] ?? null,
  }
}

function extractOpportunities(lines: string[], textContent: string) {
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

    const vacanciesValue = match[2].toUpperCase() === 'CR' ? null : Number.parseInt(match[2], 10)
    opportunities.push({
      role,
      specialty: null,
      vacancies: Number.isFinite(vacanciesValue ?? Number.NaN) ? vacanciesValue : null,
      reserveVacancies: null,
      salary: compactWhitespace(match[3] ?? '') || null,
      workload: null,
      location: null,
      requirements: [],
    })
    seenRoles.add(role.toLowerCase())
  }

  if (opportunities.length > 0) {
    return opportunities
  }

  const cargoMatcher =
    /(?:cargo|cargos|emprego|empregos|funcao|função)\s+(?:de\s+)?([A-ZÀ-Ú][A-Za-zÀ-ú0-9\s/().-]{3,80})/gi

  const fallbackMatches = [...textContent.matchAll(cargoMatcher)]
  for (const match of fallbackMatches.slice(0, 8)) {
    const role = compactWhitespace(match[1]).replace(/[.;,:-]+$/, '')
    if (!role || seenRoles.has(role.toLowerCase())) {
      continue
    }

    opportunities.push({
      role,
      specialty: null,
      vacancies: null,
      reserveVacancies: null,
      salary: null,
      workload: null,
      location: null,
      requirements: [],
    })
    seenRoles.add(role.toLowerCase())
  }

  return opportunities
}

function normalizeForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanSubjectTitle(value: string): string {
  return compactWhitespace(value)
    .replace(/^\d{1,3}(?:[.)-]|\s)+/, '')
    .replace(/[:.;,-]+$/, '')
    .trim()
}

function cleanTopic(value: string): string {
  return compactWhitespace(value)
    .replace(/^\d+(?:\.\d+)*[.)-]?\s*/, '')
    .replace(/^[\-•*]\s*/, '')
    .replace(/[:.;,-]+$/, '')
    .trim()
}

function looksLikeSubjectTitle(value: string): boolean {
  const title = cleanSubjectTitle(value)
  const normalized = normalizeForCompare(title)
  const letters = [...title].filter((char) => /\p{L}/u.test(char))
  const upperLetters = letters.filter((char) => char === char.toLocaleUpperCase('pt-BR'))
  const upperRatio = letters.length ? upperLetters.length / letters.length : 0

  if (title.length < 3 || title.length > 120 || letters.length < 3) return false
  if (/^(conteudo programatico|conhecimentos gerais|conhecimentos especificos|prova objetiva|disciplinas|materias cobradas)$/i.test(normalized)) return false
  if (/^(anexo|cronograma|bibliografia|das inscricoes|do concurso|dos recursos|resultado|classificacao)/i.test(normalized)) return false

  return upperRatio >= 0.7 || /^(lingua|direito|nocoes|matematica|informatica|raciocinio|legislacao|administracao|portugues|conhecimentos)/i.test(normalized)
}

function splitTopics(value: string): string[] {
  return value
    .split(/\r?\n|[;•]/)
    .map(cleanTopic)
    .filter((topic) => topic.length >= 4)
}

function extractSubjects(lines: string[]) {
  const headingIndex = lines.findIndex((line) =>
    /conteudo programatico|conteúdo programático|disciplinas|materias cobradas|matérias cobradas/i.test(
      line,
    ),
  )

  if (headingIndex < 0) {
    return []
  }

  const subjects: Array<{ role: string | null; topics: string[] }> = []
  let current: { role: string; topics: string[] } | null = null

  function flushCurrent() {
    if (!current) return
    const topics = dedupeStrings(current.topics).slice(0, 80)
    subjects.push({ role: current.role, topics })
    current = null
  }

  for (const rawLine of lines.slice(headingIndex + 1, headingIndex + 180)) {
    const line = compactWhitespace(rawLine)
    const normalized = normalizeForCompare(line)
    if (!line) continue
    if (/^(anexo|cronograma|bibliografia|resultado|classificacao|dos recursos|das inscricoes)/i.test(normalized)) {
      if (subjects.length || current) break
      continue
    }

    const colonMatch = line.match(/^(.{3,120}?)\s*:\s*(.+)$/)
    if (colonMatch && looksLikeSubjectTitle(colonMatch[1])) {
      flushCurrent()
      current = { role: cleanSubjectTitle(colonMatch[1]), topics: splitTopics(colonMatch[2]) }
      continue
    }

    const numberedMatch = line.match(/^\d{1,3}[.)-]?\s+(.+)$/)
    const candidateTitle = numberedMatch?.[1] ?? line
    const decimalTopic = /^\d+(?:\.\d+)+[.)-]?\s+/.test(line)
    if (!decimalTopic && looksLikeSubjectTitle(candidateTitle)) {
      flushCurrent()
      current = { role: cleanSubjectTitle(candidateTitle), topics: [] }
      continue
    }

    if (current) {
      current.topics.push(...splitTopics(line))
    }
  }

  flushCurrent()

  if (subjects.length > 0) {
    return subjects.filter((subject) => subject.topics.length > 0)
  }

  const topics = dedupeStrings(
    lines
      .slice(headingIndex + 1, headingIndex + 35)
      .flatMap(splitTopics),
  ).slice(0, 30)

  return topics.length > 0 ? [{ role: 'Conteudo programatico', topics }] : []
}

function extractAttachments(lines: string[]) {
  return lines
    .filter((line) => /^anexo\s+[ivxlcdm\d]+|^anexo\b/i.test(line))
    .slice(0, 10)
    .map((line) => ({
      label: line,
      description: null,
    }))
}

function extractLocations(lines: string[]) {
  const candidates = lines
    .filter((line) => /local de prova|cidade de aplicacao|cidade de aplicação|municipio/i.test(line))
    .flatMap((line) => line.split(/[:;-]/))
    .map((piece) => compactWhitespace(piece))
    .filter((piece) => piece.length >= 4)

  return dedupeStrings(candidates).slice(0, 6)
}

export function extractEditalHeuristically(
  input: ExtractEditalHeuristicallyInput,
): EditalExtraction {
  const textContent = compactWhitespace(input.textContent)
  const lines = toLines(input.textContent)
  const extraction = createEmptyEditalExtraction(input.classification?.documentKind ?? 'desconhecido')

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
  const institution = extractInstitution(lines)
  const organizer = extractOrganizer(lines)
  const opportunities = extractOpportunities(lines, textContent)
  const subjects = extractSubjects(lines)
  const attachments = extractAttachments(lines)
  const locations = extractLocations(lines)
  const url = textContent.match(urlRegex)?.[0] ?? null

  extraction.title = pickTitle(lines, input.fileName)
  extraction.summary = summarySource.length > 20 ? summarySource.slice(0, 320) : null
  extraction.institution = institution
  extraction.organizer = organizer
  extraction.registration = {
    startDate: registrationRange.startDate,
    endDate: registrationRange.endDate,
    feeAmount: currencyToNumber(feeText),
    feeCurrency: 'BRL',
    feeNotes: feeText,
    exemptionDeadline,
    officialUrl: url,
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
    locations,
  }
  extraction.opportunities = opportunities
  extraction.subjects = subjects
  extraction.attachments = attachments
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

  const evidence = [
    findEvidence(textContent, 'edital', 'title'),
    registrationRange.startDate ? findEvidence(textContent, 'inscri', 'registration') : null,
    feeText ? findEvidence(textContent, 'taxa', 'registration.feeAmount') : null,
    examDate ? findEvidence(textContent, 'prova', 'exam.examDate') : null,
    organizer.name ? findEvidence(textContent, 'banca|organizadora|instituto|fundacao', 'organizer') : null,
  ]
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 8)

  if (opportunities.length > 0) {
    evidence.push({
      field: 'opportunities',
      excerpt: opportunities
        .map((opportunity) => opportunity.role)
        .slice(0, 3)
        .join('; '),
      page: null,
    })
  }

  extraction.evidence = evidence

  if (input.classification?.isScannedCandidate) {
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
