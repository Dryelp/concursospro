import {
  editalExtractionJsonSchema,
  normalizeEditalExtraction,
  type EditalAiPayload,
  type EditalExtraction,
} from './schema.ts'

export interface ProviderExtractionResult {
  provider: 'gemini' | 'openrouter'
  model: string
  extraction: EditalExtraction
  warnings: string[]
}

const systemPrompt = [
  'Voce extrai dados estruturados de editais de concursos publicos brasileiros.',
  'Responda somente com JSON valido no schema fornecido.',
  'Nao invente campos ausentes; use null, arrays vazios e confidence menor quando faltar evidencia.',
  'Preserve datas no formato original encontrado no texto, preferencialmente dd/mm/aaaa.',
  'No campo subjects, cada item deve representar uma disciplina/materia do conteudo programatico: role = nome da disciplina e topics = lista detalhada dos assuntos que o candidato deve estudar nessa disciplina.',
  'Nao coloque apenas nomes de materias em subjects.topics. Se encontrar "Lingua Portuguesa: interpretacao, ortografia", retorne role "Lingua Portuguesa" e topics ["interpretacao", "ortografia"].',
  'Nunca use pontuacao, peso, numero de questoes ou valor da prova como topics. "20,0 pontos", "10 questoes" e "peso 2" pertencem a examStructure, nao ao conteudo programatico.',
  'Nao agrupe disciplinas atomicas em areas amplas quando o edital ou a matriz separar os nomes. Se aparecer Ciencias Humanas contendo Historia, Geografia, Filosofia ou Sociologia, crie subjects separados para cada disciplina quando houver topicos proprios.',
  'Se examStructure.disciplines listar uma disciplina, essa disciplina tambem deve existir em subjects sempre que houver conteudo programatico relacionado a ela.',
  'Procure anexos e secoes como Conteudo Programatico, Conhecimentos Gerais, Conhecimentos Especificos, Programa de Prova e Objetos de Avaliacao; extraia o maximo de topicos sustentados pelo texto.',
  'subjects deve conter somente conteudo de estudo da prova objetiva/escrita. Nao transforme etapas do concurso em materia.',
  'Nunca inclua como subject: teste de aptidao/capacitacao fisica, TAF, avaliacao psicologica, exame medico, inspecao de saude, investigacao social, prova de titulos, heteroidentificacao, procedimento documental, curso de formacao ou fases semelhantes.',
  'Se o edital listar fases do certame, use isso apenas como contexto; procure a secao "conteudo programatico", "programa da prova", "conhecimentos" ou "objetos de avaliacao" para preencher subjects.',
  'Extraia tambem examStructure quando houver matriz da prova: total de questoes, tempo, formato e quantidade/peso por disciplina.',
  'examStructure e obrigatorio quando o edital informar quadro de provas, numero de questoes, valor por questao, pontuacao, duracao, disciplinas da prova objetiva/escrita ou carater eliminatorio/classificatorio.',
  'Em examStructure.disciplines, cada disciplina deve trazer questionCount quando o quadro do edital informar quantidade de questoes. Se o edital trouxer apenas pontos/peso, preencha weight e notes.',
  'Procure a estrutura da prova em secoes como: provas, prova objetiva, quadro de provas, tabela de provas, composicao da prova, numero de questoes, pontuacao, duracao da prova e criterios de avaliacao.',
  'Se a matriz da prova estiver incompleta, preencha apenas o que estiver sustentado pelo edital e registre warnings.',
  'Use warnings para ambiguidade relevante e evidence para trechos curtos que sustentem os principais campos.',
].join(' ')

async function readErrorBody(response: Response) {
  return (await response.text().catch(() => '')).slice(0, 500)
}

function shortFailure(model: string, status: number, body: string) {
  const message = body
    .replace(/\s+/g, ' ')
    .match(/"message"\s*:\s*"([^"]+)"/)?.[1]

  return `${model}:${status}${message ? `:${message.slice(0, 120)}` : ''}`
}

function isAccountOrLimitFailure(status: number, body: string) {
  if ([401, 402, 403, 429].includes(status)) return true
  if (status !== 400) return false

  return /billing|payment|quota|credit|permission|api key|apikey|disabled|exceeded|rate limit/i.test(body)
}

const contentProgramKeywords = [
  'conteudo programatico',
  'conteudos programaticos',
  'programa da prova',
  'programa de prova',
  'programas de prova',
  'conteudo da prova',
  'conteudo das provas',
  'conhecimentos gerais',
  'conhecimentos especificos',
  'objetos de avaliacao',
  'disciplinas cobradas',
  'materias cobradas',
]

const examStructureKeywords = [
  'quadro de provas',
  'tabela de provas',
  'prova objetiva',
  'provas objetivas',
  'composicao da prova',
  'composição da prova',
  'numero de questoes',
  'número de questões',
  'quantidade de questoes',
  'quantidade de questões',
  'pontuacao',
  'pontuação',
  'duracao da prova',
  'duração da prova',
  'valor por questao',
  'valor por questão',
  'carater eliminatorio',
  'caráter eliminatório',
]

function compactLines(textContent: string): string[] {
  return textContent
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function findKeywordIndexes(lines: string[], keywords: string[]): number[] {
  return lines
    .map((line, index) => ({ line: normalizeForCompare(line), index }))
    .filter(({ line }) => keywords.some((keyword) => line.includes(normalizeForCompare(keyword))))
    .map(({ index }) => index)
}

function collectWindows(lines: string[], indexes: number[], before: number, after: number): string {
  const selected = new Map<number, string>()

  for (const index of indexes) {
    const start = Math.max(0, index - before)
    const end = Math.min(lines.length, index + after)

    for (let cursor = start; cursor < end; cursor += 1) {
      selected.set(cursor, lines[cursor])
    }
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, line]) => `${index + 1}: ${line}`)
    .join('\n')
}

function buildRelevantTextBlock(textContent: string): string {
  const trimmed = textContent.trim()
  if (!trimmed) {
    return 'Sem texto extraido localmente. Leia o arquivo anexado por visao/OCR e extraia apenas dados sustentados pelo documento.'
  }

  const maxChars = 180_000
  const lines = compactLines(textContent)
  const contentIndexes = findKeywordIndexes(lines, contentProgramKeywords)
  const structureIndexes = findKeywordIndexes(lines, examStructureKeywords)
  const contentBlock = contentIndexes.length
    ? collectWindows(lines, contentIndexes.slice(0, 12), 10, 420)
    : lines.slice(-900).map((line, index) => `${Math.max(1, lines.length - 900) + index}: ${line}`).join('\n')
  const structureBlock = structureIndexes.length
    ? collectWindows(lines, structureIndexes.slice(0, 12), 10, 160)
    : lines.slice(0, 260).map((line, index) => `${index + 1}: ${line}`).join('\n')

  const sections: string[] = []
  sections.push(`=== BLOCO 1: INICIO/METADADOS DO EDITAL ===\n${lines.slice(0, 160).map((line, index) => `${index + 1}: ${line}`).join('\n')}`)
  sections.push(`=== BLOCO 2: CONTEUDO PROGRAMATICO ISOLADO - USE PARA subjects ===\n${contentBlock}`)
  sections.push(`=== BLOCO 3: MATRIZ/ESTRUTURA DA PROVA - USE APENAS PARA examStructure ===\n${structureBlock}`)

  const relevant = sections.join('\n\n')
  if (relevant.length <= maxChars) {
    return relevant
  }

  const priority = sections
    .filter((section) => section.includes('BLOCO 2'))
    .join('\n\n')
    .slice(0, 145_000)
  const intro = sections[0].slice(0, 18_000)
  const matrix = sections.at(-1)?.slice(0, 17_000) ?? ''

  return [intro, priority, matrix].filter(Boolean).join('\n\n')
}

function buildUserPrompt(payload: EditalAiPayload): string {
  const textBlock = buildRelevantTextBlock(payload.textContent)

  return [
    `Arquivo: ${payload.fileName}`,
    `MIME: ${payload.mimeType ?? 'desconhecido'}`,
    `Classificacao local: ${JSON.stringify(payload.classification)}`,
    payload.fileData
      ? 'Arquivo anexado em inlineData para leitura visual/OCR.'
      : 'Sem arquivo anexado para leitura visual.',
    payload.heuristicExtraction
      ? `Fallback heuristico local: ${JSON.stringify(payload.heuristicExtraction)}`
      : 'Fallback heuristico local: null',
    'Regra obrigatoria para conteudo programatico: subjects deve conter disciplinas reais, e cada disciplina precisa carregar seus topicos de estudo. Nao basta listar "Lingua Portuguesa" ou "Matematica"; extraia os assuntos internos de cada uma.',
    'Regra anti-lixo: subjects.topics nunca pode conter pontuacao, peso ou quantidade de questoes. Se o trecho for "20,0 pontos", use isso apenas em examStructure.notes/weight e continue procurando o conteudo programatico real.',
    'Regra de granularidade: nao salve apenas areas grandes como "Ciencias Humanas", "Ciencias Naturais" ou "Conhecimentos Gerais" quando o edital trouxer disciplinas internas. Promova as disciplinas internas para subjects proprios.',
    'Regra de exclusao: nao use fases do concurso como materia. TAF/teste fisico/avaliacao psicologica/exame medico/investigacao social/curso de formacao/prova de titulos nao entram em subjects.',
    'Separacao obrigatoria: extraia subjects somente do BLOCO 2. Use o BLOCO 3 apenas para examStructure. Nunca copie peso, pontos, nota ou quantidade de questoes do BLOCO 3 para subjects.topics.',
    'Prioridade absoluta: se o BLOCO 2 contiver conteudo programatico, ignore listas de etapas/fases do concurso.',
    'Regra obrigatoria para estrutura da prova: procure no BLOCO 3 a tabela/quadro que informa quantas questoes existem na prova objetiva/escrita. Preencha examStructure.totalQuestions, durationMinutes, format e disciplines[].questionCount quando sustentado pelo texto.',
    'Texto do edital abaixo:',
    textBlock,
  ].join('\n\n')
}

function normalizeForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isSelectionPhase(value: string | null | undefined): boolean {
  const normalized = normalizeForCompare(value ?? '')
  if (!normalized) return false

  return /\b(taf|teste de aptidao fisica|teste de capacitacao fisica|teste fisico|avaliacao fisica|exame medico|inspecao de saude|avaliacao psicologica|exame psicologico|investigacao social|sindicancia|heteroidentificacao|prova de titulos|curso de formacao|procedimento documental|entrega de documentos)\b/.test(normalized)
}

function isStudyTopic(value: string | null | undefined): value is string {
  const topic = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (topic.length < 4) return false

  return !/^\d+(?:[,.]\d+)?\s*(?:pontos?|quest(?:ao|oes|ões))$/i.test(topic) &&
    !/^(?:pontos?|pontuacao|pontuação|valor|nota|peso)\b/i.test(topic)
}

function isBroadSubjectName(value: string | null | undefined): boolean {
  const normalized = normalizeForCompare(value ?? '')

  return /\b(conhecimentos gerais|conhecimentos especificos|conhecimentos basicos|ciencias humanas|ciencias naturais|atualidades)\b/.test(normalized)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean))]
}

function subjectNameFromTopic(topic: string): { name: string; topics: string[] } | null {
  const match = topic.match(/^(.{3,120}?)\s*:\s*(.+)$/)
  if (!match) return null

  const name = match[1]
    .replace(/^\s*\d+(?:\.\d+)*[.)-]?\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[:.;,-]+$/, '')
    .trim()
  const topics = uniqueStrings(
    match[2]
      .split(/\r?\n|[;]/)
      .map((item) =>
        item
          .replace(/^\s*\d+(?:\.\d+)*[.)-]?\s*/, '')
          .replace(/\s+/g, ' ')
          .replace(/[:.;,-]+$/, '')
          .trim(),
      ),
  ).filter(isStudyTopic)

  return name.length >= 3 && topics.length ? { name, topics } : null
}

function subjectNameFromKeywordTopic(topic: string): string | null {
  const normalized = normalizeForCompare(topic)

  if (/\b(historia|historico|brasil colonia|brasil imperio|republica|idade media|idade moderna)\b/.test(normalized)) return 'História'
  if (/\b(geografia|cartografia|clima|relevo|hidrografia|urbanizacao|globalizacao|populacao|territorio)\b/.test(normalized)) return 'Geografia'
  if (/\b(filosofia|etica|moral|socrates|platao|aristoteles|kant|contratualismo)\b/.test(normalized)) return 'Filosofia'
  if (/\b(sociologia|sociedade|cultura|cidadania|movimentos sociais|desigualdade social|trabalho e sociedade)\b/.test(normalized)) return 'Sociologia'
  if (/\b(biologia|ecologia|genetica|celula|fisiologia|evolucao|botanica|zoologia)\b/.test(normalized)) return 'Biologia'
  if (/\b(quimica|atomo|molecula|substancia|mistura|reacao|estequiometria|tabela periodica)\b/.test(normalized)) return 'Química'
  if (/\b(fisica|mecanica|cinematica|dinamica|optica|eletricidade|termodinamica|ondulatoria)\b/.test(normalized)) return 'Física'

  return null
}

function splitBroadSubject(subject: EditalExtraction['subjects'][number]) {
  if (!isBroadSubjectName(subject.role)) return []

  const grouped = new Map<string, string[]>()

  for (const topic of subject.topics.filter(isStudyTopic)) {
    const parsed = subjectNameFromTopic(topic)
    const name = parsed?.name ?? subjectNameFromKeywordTopic(topic)
    const topics = parsed?.topics ?? [topic]
    if (!name) continue

    grouped.set(name, uniqueStrings([...(grouped.get(name) ?? []), ...topics]))
  }

  return [...grouped.entries()].map(([role, topics]) => ({ role, topics }))
}

function isUsefulSubject(subject: EditalExtraction['subjects'][number]): boolean {
  if (isSelectionPhase(subject.role)) return false
  const topics = subject.topics.filter((topic) => !isSelectionPhase(topic) && isStudyTopic(topic))
  return Boolean(subject.role || topics.length) && topics.length > 0
}

function sanitizeExtractionSubjects(
  extraction: EditalExtraction,
  fallback: EditalExtraction | null | undefined,
): EditalExtraction {
  const expandedSubjects = extraction.subjects.flatMap((subject) => {
    const split = splitBroadSubject(subject)
    return split.length ? split : [subject]
  })
  const cleanedSubjects = expandedSubjects
    .flatMap((subject) => {
      const parsedTopics = subject.topics
        .map(subjectNameFromTopic)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
      if ((!subject.role || isBroadSubjectName(subject.role)) && parsedTopics.length) {
        return parsedTopics.map((item) => ({
          role: item.name,
          topics: item.topics,
        }))
      }

      return [{
        ...subject,
        topics: uniqueStrings(subject.topics).filter((topic) => !isSelectionPhase(topic) && isStudyTopic(topic)),
      }]
    })
    .filter(isUsefulSubject)

  if (cleanedSubjects.length > 0) {
    return { ...extraction, subjects: cleanedSubjects }
  }

  const fallbackSubjects = fallback?.subjects
    .map((subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => !isSelectionPhase(topic) && isStudyTopic(topic)),
    }))
    .filter(isUsefulSubject)

  if (fallbackSubjects?.length) {
    return {
      ...extraction,
      subjects: fallbackSubjects,
      warnings: [
        ...extraction.warnings,
        'Subjects do provider pareciam fases do concurso; usando conteudo programatico heuristico.',
      ],
    }
  }

  return {
    ...extraction,
    subjects: [],
    warnings: [
      ...extraction.warnings,
      'Nao foi possivel confirmar conteudo programatico da prova objetiva/escrita.',
    ],
  }
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]+?)```/i)?.[1] ?? trimmed.match(/```([\s\S]+?)```/i)?.[1]
    if (fenced) {
      return JSON.parse(fenced.trim())
    }

    const objectStart = trimmed.indexOf('{')
    const objectEnd = trimmed.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1))
    }

    throw new Error('Nao foi possivel interpretar JSON da resposta do provider.')
  }
}

async function callGemini(payload: EditalAiPayload): Promise<ProviderExtractionResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY ausente.')
  }

  const userParts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: buildUserPrompt(payload) }]

  if (payload.fileData) {
    userParts.push({
      inlineData: {
        mimeType: payload.fileData.mimeType,
        data: payload.fileData.base64,
      },
    })
  }

  const models = [
    Deno.env.get('GEMINI_EDITAL_MODEL')?.trim(),
    Deno.env.get('GEMINI_EXTRACT_MODEL')?.trim(),
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
    Deno.env.get('GEMINI_MODEL')?.trim(),
    'gemini-2.5-flash',
  ].filter((model, index, list): model is string =>
    Boolean(model) && list.indexOf(model) === index
  )
  const failures: string[] = []

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: userParts,
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 32000,
            responseMimeType: 'application/json',
            responseSchema: editalExtractionJsonSchema,
          },
        }),
      },
    )

    if (!response.ok) {
      const body = await readErrorBody(response)
      failures.push(shortFailure(model, response.status, body))
      if (isAccountOrLimitFailure(response.status, body)) break
      continue
    }

    const data = await response.json()
    const rawText = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')

    if (!rawText) {
      failures.push(`${model}:empty`)
      continue
    }

    try {
      return {
        provider: 'gemini',
        model,
        extraction: sanitizeExtractionSubjects(
          normalizeEditalExtraction(tryParseJson(rawText)),
          payload.heuristicExtraction,
        ),
        warnings: [],
      }
    } catch (error) {
      failures.push(`${model}:${error instanceof Error ? error.message : 'invalid-json'}`)
    }
  }

  throw new Error(`Gemini nao conseguiu extrair edital (${failures.join(', ')}).`)
}

async function callOpenRouter(payload: EditalAiPayload): Promise<ProviderExtractionResult> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY ausente.')
  }

  if (payload.fileData && !payload.textContent.trim()) {
    throw new Error('OpenRouter sem texto local foi ignorado; configure Gemini para leitura visual/OCR.')
  }

  const models = [
    Deno.env.get('OPENROUTER_EDITAL_MODEL')?.trim(),
    Deno.env.get('OPENROUTER_EXTRACT_MODEL')?.trim(),
    Deno.env.get('OPENROUTER_MODEL')?.trim(),
    'google/gemini-2.5-flash-lite',
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-chat-v3-0324:free',
    'deepseek/deepseek-chat',
  ].filter((model, index, list): model is string =>
    Boolean(model) && list.indexOf(model) === index
  )
  const failures: string[] = []

  for (const model of models) {
    const modes = ['json_schema', 'json_object', 'prompt']

    for (const mode of modes) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('OPENROUTER_REFERER') ?? 'https://concurseiro.pro',
          'X-Title': Deno.env.get('OPENROUTER_TITLE') ?? 'Concurseiro Pro',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 12000,
          ...(mode === 'json_schema' ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'edital_extraction',
                strict: true,
                schema: editalExtractionJsonSchema,
              },
            },
          } : {}),
          ...(mode === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            {
              role: 'system',
              content: mode === 'prompt'
                ? `${systemPrompt} Responda exclusivamente com JSON valido, sem markdown e sem texto fora do JSON.`
                : systemPrompt,
            },
            {
              role: 'user',
              content: buildUserPrompt(payload),
            },
          ],
        }),
      })

      if (!response.ok) {
        const body = await readErrorBody(response)
        failures.push(shortFailure(`${model}:${mode}`, response.status, body))
        if (isAccountOrLimitFailure(response.status, body)) {
          throw new Error(`OpenRouter retornou erro de conta/limite (${failures.join(', ')}).`)
        }
        continue
      }

      const data = await response.json()
      const rawContent = data?.choices?.[0]?.message?.content

      if (!rawContent) {
        failures.push(`${model}:${mode}:empty`)
        continue
      }

      try {
        return {
          provider: 'openrouter',
          model,
          extraction: sanitizeExtractionSubjects(
            normalizeEditalExtraction(typeof rawContent === 'string' ? tryParseJson(rawContent) : rawContent),
            payload.heuristicExtraction,
          ),
          warnings: [],
        }
      } catch (error) {
        failures.push(`${model}:${mode}:${error instanceof Error ? error.message : 'invalid-json'}`)
      }
    }
  }

  throw new Error(`OpenRouter nao conseguiu extrair edital (${failures.join(', ')}).`)
}

export async function extractWithProviders(
  payload: EditalAiPayload,
): Promise<ProviderExtractionResult | null> {
  const hasGemini = Boolean(Deno.env.get('GEMINI_API_KEY'))
  const hasOpenRouter = Boolean(Deno.env.get('OPENROUTER_API_KEY'))

  if (hasGemini) {
    try {
      return await callGemini(payload)
    } catch (error) {
      console.error('Gemini extraction failed', error)
    }
  }

  if (hasOpenRouter) {
    try {
      return await callOpenRouter(payload)
    } catch (error) {
      console.error('OpenRouter extraction failed', error)
    }
  }

  return null
}
