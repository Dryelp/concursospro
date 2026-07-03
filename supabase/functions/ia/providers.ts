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
  'Procure anexos e secoes como Conteudo Programatico, Conhecimentos Gerais, Conhecimentos Especificos, Programa de Prova e Objetos de Avaliacao; extraia o maximo de topicos sustentados pelo texto.',
  'subjects deve conter somente conteudo de estudo da prova objetiva/escrita. Nao transforme etapas do concurso em materia.',
  'Nunca inclua como subject: teste de aptidao/capacitacao fisica, TAF, avaliacao psicologica, exame medico, inspecao de saude, investigacao social, prova de titulos, heteroidentificacao, procedimento documental, curso de formacao ou fases semelhantes.',
  'Se o edital listar fases do certame, use isso apenas como contexto; procure a secao "conteudo programatico", "programa da prova", "conhecimentos" ou "objetos de avaliacao" para preencher subjects.',
  'Extraia tambem examStructure quando houver matriz da prova: total de questoes, tempo, formato e quantidade/peso por disciplina.',
  'Se a matriz da prova estiver incompleta, preencha apenas o que estiver sustentado pelo edital e registre warnings.',
  'Use warnings para ambiguidade relevante e evidence para trechos curtos que sustentem os principais campos.',
].join(' ')

function buildUserPrompt(payload: EditalAiPayload): string {
  const textBlock = payload.textContent.trim()
    ? payload.textContent.slice(0, 90000)
    : 'Sem texto extraido localmente. Leia o arquivo anexado por visao/OCR e extraia apenas dados sustentados pelo documento.'

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
    'Regra de exclusao: nao use fases do concurso como materia. TAF/teste fisico/avaliacao psicologica/exame medico/investigacao social/curso de formacao/prova de titulos nao entram em subjects.',
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

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-pro'
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
          maxOutputTokens: 16000,
          responseMimeType: 'application/json',
          responseSchema: editalExtractionJsonSchema,
        },
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Gemini retornou ${response.status}.`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? '')
    .join('\n')

  if (!rawText) {
    throw new Error('Gemini nao retornou conteudo estruturado.')
  }

  return {
    provider: 'gemini',
    model,
    extraction: sanitizeExtractionSubjects(
      normalizeEditalExtraction(tryParseJson(rawText)),
      payload.heuristicExtraction,
    ),
    warnings: [],
  }
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
