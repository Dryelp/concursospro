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

function buildRelevantTextBlock(textContent: string): string {
  const trimmed = textContent.trim()
  if (!trimmed) {
    return 'Sem texto extraido localmente. Leia o arquivo anexado por visao/OCR e extraia apenas dados sustentados pelo documento.'
  }

  const maxChars = 180_000
  if (trimmed.length <= maxChars) {
    return trimmed
  }

  const lines = textContent.split(/\r?\n/)
  const headingIndexes = lines
    .map((line, index) => ({ line: normalizeForCompare(line), index }))
    .filter(({ line }) => contentProgramKeywords.some((keyword) => line.includes(keyword)))
    .map(({ index }) => index)

  const sections: string[] = []
  sections.push(`=== INICIO DO EDITAL ===\n${lines.slice(0, 140).join('\n')}`)

  for (const index of headingIndexes.slice(0, 10)) {
    const start = Math.max(0, index - 12)
    const end = Math.min(lines.length, index + 260)
    sections.push(`=== TRECHO PRIORITARIO DE CONTEUDO PROGRAMATICO - LINHA ${index + 1} ===\n${lines.slice(start, end).join('\n')}`)
  }

  sections.push(`=== FINAL/ANEXOS DO EDITAL ===\n${lines.slice(-520).join('\n')}`)

  const relevant = sections.join('\n\n')
  if (relevant.length <= maxChars) {
    return relevant
  }

  const priority = sections
    .filter((section) => section.includes('TRECHO PRIORITARIO'))
    .join('\n\n')
    .slice(0, 145_000)
  const intro = sections[0].slice(0, 18_000)
  const tail = sections.at(-1)?.slice(0, 17_000) ?? ''

  return [intro, priority, tail].filter(Boolean).join('\n\n')
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
    'Regra de granularidade: nao salve apenas areas grandes como "Ciencias Humanas", "Ciencias Naturais" ou "Conhecimentos Gerais" quando o edital trouxer disciplinas internas. Promova as disciplinas internas para subjects proprios.',
    'Regra de exclusao: nao use fases do concurso como materia. TAF/teste fisico/avaliacao psicologica/exame medico/investigacao social/curso de formacao/prova de titulos nao entram em subjects.',
    'Prioridade absoluta: se houver trechos marcados como TRECHO PRIORITARIO DE CONTEUDO PROGRAMATICO, extraia subjects desses trechos e ignore listas de etapas/fases do concurso.',
    'Regra obrigatoria para estrutura da prova: procure nos trechos prioritarios a tabela/quadro que informa quantas questoes existem na prova objetiva/escrita. Preencha examStructure.totalQuestions, durationMinutes, format e disciplines[].questionCount quando sustentado pelo texto.',
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

function isUsefulSubject(subject: EditalExtraction['subjects'][number]): boolean {
  if (isSelectionPhase(subject.role)) return false
  const topics = subject.topics.filter((topic) => !isSelectionPhase(topic))
  return Boolean(subject.role || topics.length) && topics.length > 0
}

function sanitizeExtractionSubjects(
  extraction: EditalExtraction,
  fallback: EditalExtraction | null | undefined,
): EditalExtraction {
  const cleanedSubjects = extraction.subjects
    .map((subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => !isSelectionPhase(topic)),
    }))
    .filter(isUsefulSubject)

  if (cleanedSubjects.length > 0) {
    return { ...extraction, subjects: cleanedSubjects }
  }

  const fallbackSubjects = fallback?.subjects
    .map((subject) => ({
      ...subject,
      topics: subject.topics.filter((topic) => !isSelectionPhase(topic)),
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
      failures.push(`${model}:${response.status}`)
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

  const model = Deno.env.get('OPENROUTER_MODEL') ?? 'google/gemini-2.5-flash-lite'
  if (payload.fileData && !payload.textContent.trim()) {
    throw new Error('OpenRouter sem texto local foi ignorado; configure Gemini para leitura visual/OCR.')
  }

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
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'edital_extraction',
          strict: true,
          schema: editalExtractionJsonSchema,
        },
      },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: buildUserPrompt(payload),
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter retornou ${response.status}.`)
  }

  const data = await response.json()
  const rawContent = data?.choices?.[0]?.message?.content

  if (!rawContent) {
    throw new Error('OpenRouter nao retornou conteudo estruturado.')
  }

  return {
    provider: 'openrouter',
    model,
    extraction: sanitizeExtractionSubjects(
      normalizeEditalExtraction(typeof rawContent === 'string' ? tryParseJson(rawContent) : rawContent),
      payload.heuristicExtraction,
    ),
    warnings: [],
  }
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
