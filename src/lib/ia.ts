import { z } from 'zod'

const iaResponseSchema = z.object({
  text: z.string(),
})

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type IaOptions<T> = {
  task?: string
  maxTokens?: number
  schema?: z.ZodType<T>
  retries?: number
  accessToken?: string
  timeoutMs?: number
}

const TIMEOUT_MS = 25_000

function extractJson(text: string) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
  const object = clean.match(/\{[\s\S]*\}/)
  const array = clean.match(/\[[\s\S]*\]/)
  return object?.[0] ?? array?.[0] ?? clean
}

function parseStructuredResponse<T>(text: string, schema: z.ZodType<T>) {
  try {
    return schema.parse(JSON.parse(extractJson(text)))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('A IA retornou uma resposta fora do formato esperado. Tente gerar novamente.')
    }

    throw error
  }
}

export async function callIA<T = string>(
  messages: Message[],
  options: IaOptions<T> = {},
): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado para chamadas de IA.')
  }

  const retries = options.retries ?? 1
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${url}/functions/v1/ia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${options.accessToken ?? key}`,
        },
        body: JSON.stringify({
          messages,
          task: options.task ?? 'general',
          max_tokens: options.maxTokens ?? 2000,
        }),
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? `Falha na IA (${response.status}).`)
      }

      const { text } = iaResponseSchema.parse(await response.json())
      if (!options.schema) {
        return text as T
      }

      return parseStructuredResponse(text, options.schema)
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new Error('A IA demorou demais para gerar as questoes. Tente novamente com menos questoes ou um topico mais especifico.')
  }

  throw lastError instanceof Error ? lastError : new Error('Falha inesperada na IA.')
}
