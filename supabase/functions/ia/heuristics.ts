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
  if (isSelectionPhase(normalized)) return false

  return upperRatio >= 0.7 || /^(lingua|direito|nocoes|matematica|informatica|raciocinio|legislacao|administracao|portugues|conhecimentos)/i.test(normalized)
}

function isSelectionPhase(value: string): boolean {
  const normalized = normalizeForCompare(value)
  return /\b(taf|teste de aptidao fisica|teste de capacitacao fisica|teste fisico|avaliacao fisica|exame medico|inspecao de saude|avaliacao psicologica|exame psicologico|investigacao social|sindicancia|heteroidentificacao|prova de titulos|curso de formacao|procedimento documental|entrega de documentos)\b/.test(normalized)
}

function isProgramContentHeading(value: string): boolean {
  const normalized = normalizeForCompare(value)
  return /conteudo programatico|conteudos programaticos|programa da prova|programa de prova|programas de prova|conteudo da prova|conteudo das provas|conhecimentos gerais|conhecimentos especificos|objetos de avaliacao|disciplinas cobradas|materias cobradas/.test(normalized)
}

function isExamStructureHeading(value: string): boolean {
  const normalized = normalizeForCompare(value)
  return /quadro de provas|tabela de provas|prova objetiva|provas objetivas|composicao da prova|numero de questoes|quantidade de questoes|pontuacao|duracao da prova|valor por questao|carater eliminatorio|estrutura da prova/.test(normalized)
}

function extractDurationMinutes(lines: string[]): number | null {
  const joined = lines.join(' ')
  const hourMinuteMatch = joined.match(/(\d{1,2})\s*h(?:oras?)?\s*(?:e\s*)?(\d{1,2})?\s*min/i)
  if (hourMinuteMatch) {
    return Number(hourMinuteMatch[1]) * 60 + Number(hourMinuteMatch[2] ?? 0)
  }

  const hourMatch = joined.match(/(\d{1,2})\s*(?:horas|hora)\b/i)
  if (hourMatch) return Number(hourMatch[1]) * 60

  const minuteMatch = joined.match(/(\d{2,3})\s*minutos\b/i)
  return minuteMatch ? Number(minuteMatch[1]) : null
}

function findSubjectNameInLine(line: string, subjectNames: string[]): string | null {
  const normalized = normalizeForCompare(line)

  return subjectNames.find((name) => {
    const normalizedName = normalizeForCompare(name)
    return normalized.includes(normalizedName) || normalizedName.includes(normalized)
  }) ?? null
}

function extractStandaloneQuestionCount(lines: string[], index: number): number | null {
  for (const candidate of lines.slice(index + 1, index + 5)) {
    const normalized = normalizeForCompare(candidate)
    if (isSelectionPhase(normalized)) return null

    const numberMatch = candidate.match(/^\s*(\d{1,3})(?:\s*(?:quest(?:ao|oes|ões)|itens?))?\s*$/i)
    if (!numberMatch) continue

    const count = Number(numberMatch[1])
    if (count > 0 && count <= 120) return count
  }

  return null
}

function isExamStructureNoiseName(value: string): boolean {
  return /^(total|subtotal|disciplina|materia|numero de questoes|quantidade de questoes|pontos|pontuacao|valor|prova objetiva|quadro de provas|tabela de provas|provas)\b/.test(
    normalizeForCompare(value),
  )
}

function extractExamStructure(lines: string[], subjects: Array<{ role: string | null; topics: string[] }>): EditalExtraction['examStructure'] {
  const headingIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isExamStructureHeading(line))
    .map(({ index }) => index)

  const windows = headingIndexes.length
    ? headingIndexes.flatMap((index) => lines.slice(Math.max(0, index - 8), Math.min(lines.length, index + 90)))
    : lines.slice(0, 260)

  const disciplines: EditalExtraction['examStructure']['disciplines'] = []
  const seen = new Set<string>()
  const subjectNames = subjects.map((subject) => subject.role).filter((role): role is string => Boolean(role))

  windows.forEach((line, index) => {
    const normalized = normalizeForCompare(line)
    if (isSelectionPhase(normalized)) return
    const questionMatch =
      line.match(/(.{3,100}?)(?:\s{2,}|:|\s-\s|\s\|\s).{0,80}?(\d{1,3})\s*(?:quest(?:ao|oes|ões)|itens?|pontos?)/i) ??
      line.match(/(.{3,100}?)(?:\s{2,}|:|\s-\s|\s\|\s|\.{2,})\s*(\d{1,3})(?:\s+\d{1,3})?\s*$/i)
    const matchedSubject = findSubjectNameInLine(line, subjectNames)
    const count = questionMatch
      ? Number(questionMatch[2])
      : matchedSubject
        ? extractStandaloneQuestionCount(windows, index)
        : null

    if (!count) return

    const rawName = questionMatch ? cleanSubjectTitle(questionMatch[1]) : matchedSubject
    const name = matchedSubject ?? rawName
    if (!name) return
    const key = normalizeForCompare(name)
    if (isExamStructureNoiseName(name) || (!matchedSubject && !looksLikeSubjectTitle(name))) return
    if (seen.has(key) || count <= 0 || count > 300) return

    disciplines.push({
      name,
      questionCount: count,
      weight: null,
      notes: line,
      confidence: matchedSubject ? 0.74 : 0.55,
    })
    seen.add(key)
  })

  const explicitTotal = windows
    .join(' ')
    .match(/total(?:\s+de)?[^0-9]{0,40}(\d{1,3})\s*(?:quest(?:ao|oes|ões)|itens?)/i)?.[1]
  const summedTotal = disciplines.reduce((sum, item) => sum + (item.questionCount ?? 0), 0)
  const totalQuestions = explicitTotal ? Number(explicitTotal) : summedTotal || null
  const joinedWindows = windows.join(' ')
  const normalizedWindows = normalizeForCompare(joinedWindows)
  const format = /certo\s*\/?\s*errado|certo ou errado/i.test(joinedWindows)
    ? 'true_false'
    : /\b(4|quatro)\s+alternativas\b|letras?\s+a\s*(?:a|ate)\s*d|alternativas?\s+a\s*(?:a|ate)\s*d/.test(normalizedWindows)
      ? 'multiple_choice_a_d'
      : /multipla escolha|multiplas escolhas|alternativas|letras?\s+a\s*(?:a|ate)\s*e/.test(normalizedWindows)
        ? 'multiple_choice_a_e'
        : 'unknown'

  return {
    totalQuestions,
    durationMinutes: extractDurationMinutes(windows),
    format,
    source: disciplines.length || totalQuestions ? 'edital' : 'inferred',
    confidence: disciplines.length ? 0.72 : totalQuestions ? 0.55 : 0.15,
    disciplines,
    warnings: disciplines.length
      ? []
      : ['A heuristica local nao encontrou distribuicao de questoes por disciplina.'],
  }
}

function splitTopics(value: string): string[] {
  return value
    .split(/\r?\n|[;•]/)
    .map(cleanTopic)
    .filter((topic) => topic.length >= 4 && !isSelectionPhase(topic))
}

function extractSubjects(lines: string[]): Array<{ role: string | null; topics: string[] }> {
  const headingIndex = lines.findIndex(isProgramContentHeading)

  if (headingIndex < 0) return []

  const subjects: Array<{ role: string | null; topics: string[] }> = []
  let current: { role: string; topics: string[] } | null = null

  function flushCurrent() {
    if (!current) return
    const topics = dedupeStrings(current.topics).slice(0, 80)
    subjects.push({ role: current.role, topics })
    current = null
  }

  for (const rawLine of lines.slice(headingIndex + 1, headingIndex + 220)) {
    const line = compactWhitespace(rawLine)
    const normalized = normalizeForCompare(line)
    if (!line) continue
    if (/^(anexo|cronograma|bibliografia|resultado|classificacao|dos recursos|das inscricoes)/i.test(normalized) || isSelectionPhase(normalized)) {
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
  const subjects = extractSubjects(lines)
  const examStructure = extractExamStructure(lines, subjects)

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
  extraction.examStructure = examStructure
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
