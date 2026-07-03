import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

import { editalAiRequestSchema } from './schema.ts'
import { buildHeuristicExtraction } from './heuristics.ts'
import { extractWithProviders } from './providers.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function requireUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Response('JWT ausente.', { status: 401, headers: cors })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) throw new Response('Ambiente Supabase incompleto.', { status: 500, headers: cors })
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Response('JWT inválido.', { status: 401, headers: cors })
  return data.user
}

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

const JSON_TASKS = new Set(['parse', 'crono', 'questao', 'flashcard'])

function cleanResponse(text: string) {
  return text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
}

function isValidForTask(text: string | undefined, task: string) {
  if (!text) return false
  if (!JSON_TASKS.has(task)) return true

  try {
    JSON.parse(cleanResponse(text))
    return true
  } catch {
    return false
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function timeoutForTask(task: string) {
  if (task === 'questao') return 60_000
  if (task === 'crono' || task === 'flashcard' || task === 'apostila') return 45_000
  if (task === 'tutor') return 25_000
  return 30_000
}

function systemFor(task: string) {
  const base = 'Você é o Professor Atlas, especialista em concursos públicos brasileiros. Seja preciso, didático e não invente fatos.'
  const tasks: Record<string, string> = {
    parse: ' Extraia disciplinas e tópicos. Responda somente JSON válido.',
    crono: ' Monte um cronograma realista. Responda somente JSON válido.',
    questao: ' Crie questões inéditas de múltipla escolha. Responda somente JSON válido.',
    flashcard: ' Crie flashcards objetivos. Responda somente JSON válido.',
    apostila: ' Produza uma mini apostila em Markdown, com exemplos e pontos de prova.',
    resumo: ' Produza um resumo enxuto em Markdown.',
    tutor: ' Responda como tutor particular, usando Markdown curto quando útil.',
  }
  return base + (tasks[task] ?? '')
}

function geminiModels(task: string) {
  const taskModel = Deno.env.get(`GEMINI_${task.toUpperCase()}_MODEL`)?.trim()
  const configured = Deno.env.get('GEMINI_MODEL')?.trim()
  return [
    taskModel,
    configured,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ].filter((model, index, models): model is string =>
    Boolean(model) && models.indexOf(model) === index
  )
}

async function gemini(messages: Message[], task: string, maxTokens: number) {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return null
  const failures: string[] = []

  for (const model of geminiModels(task)) {
    let response: Response
    try {
      response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemFor(task) }] },
        contents: messages.filter((item) => item.role !== 'system').map((item) => ({
          role: item.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: item.content }],
        })),
        generationConfig: {
          temperature: task === 'tutor' ? 0.35 : 0.15,
          maxOutputTokens: maxTokens,
          ...(JSON_TASKS.has(task) ? { responseMimeType: 'application/json' } : {}),
        },
      }),
      }, timeoutForTask(task))
    } catch {
      failures.push(`${model}:timeout`)
      continue
    }

    if (!response.ok) {
      failures.push(`${model}:${response.status}`)
      continue
    }

    const body = await response.json()
    const text = body?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('\n')
    if (isValidForTask(text, task)) return { text: cleanResponse(text), provider: 'gemini', model }
    failures.push(`${model}:${text ? 'invalid-json' : 'empty'}`)
  }

  throw new Error(`Gemini indisponível (${failures.join(', ')}).`)
}

async function openRouter(messages: Message[], task: string, maxTokens: number) {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) return null
  const failures: string[] = []
  const taskModel = Deno.env.get(`OPENROUTER_${task.toUpperCase()}_MODEL`)?.trim()
  const configured = Deno.env.get('OPENROUTER_MODEL')?.trim()
  const models = [
    taskModel,
    configured,
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-chat-v3.1:free',
  ].filter((model, index, list): model is string =>
    Boolean(model) && list.indexOf(model) === index
  )

  for (const model of models) {
    let response: Response
    try {
      response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('OPENROUTER_REFERER') ?? 'https://concurseiro-pro.netlify.app',
        'X-Title': 'ConcurseiroPro',
      },
      body: JSON.stringify({
        model, temperature: task === 'tutor' ? 0.35 : 0.15, max_tokens: maxTokens,
        ...(JSON_TASKS.has(task) ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: systemFor(task) }, ...messages],
      }),
      }, timeoutForTask(task))
    } catch {
      failures.push(`${model}:timeout`)
      continue
    }

    if (!response.ok) {
      failures.push(`${model}:${response.status}`)
      continue
    }

    const body = await response.json()
    const text = body?.choices?.[0]?.message?.content
    if (isValidForTask(text, task)) return { text: cleanResponse(text), provider: 'openrouter', model }
    failures.push(`${model}:${text ? 'invalid-json' : 'empty'}`)
  }

  throw new Error(`OpenRouter indisponível (${failures.join(', ')}).`)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)
  try {
    await requireUser(request)
    const body = await request.json()

    if (body?.action === 'extract_edital') {
      const parsed = editalAiRequestSchema.safeParse(body)
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? 'Payload de edital invalido.' }, 400)
      }

      const heuristic = buildHeuristicExtraction(parsed.data.payload)
      const providerResult = await extractWithProviders({
        ...parsed.data.payload,
        heuristicExtraction: parsed.data.payload.heuristicExtraction ?? heuristic,
      })
      const extraction = providerResult?.extraction ?? heuristic

      return json({
        provider: providerResult?.provider ?? 'heuristic',
        model: providerResult?.model ?? null,
        usedFallback: !providerResult,
        warnings: [
          ...heuristic.warnings,
          ...(providerResult?.warnings ?? []),
        ],
        extraction,
      })
    }

    const messages: Message[] = Array.isArray(body.messages) ? body.messages : []
    const task = typeof body.task === 'string' ? body.task : 'general'
    const maxTokens = Math.min(8000, Math.max(32, Number(body.max_tokens) || 2000))
    if (!messages.length) return json({ error: 'Envie ao menos uma mensagem.' }, 400)

    let result = null
    try { result = await gemini(messages, task, maxTokens) } catch (error) { console.error('Gemini:', error) }
    if (!result) {
      try { result = await openRouter(messages, task, maxTokens) } catch (error) { console.error('OpenRouter:', error) }
    }
    if (!result) return json({ error: 'IA não configurada ou todos os modelos da cascata falharam. Verifique GEMINI_API_KEY, OPENROUTER_API_KEY e creditos/limites.' }, 503)
    return json(result)
  } catch (error) {
    if (error instanceof Response) return error
    return json({ error: error instanceof Error ? error.message : 'Erro interno na IA.' }, 500)
  }
})
