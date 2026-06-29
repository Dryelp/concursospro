import type { SupabaseClient } from '@supabase/supabase-js'

import {
  editalAiRequestSchema,
  editalAiResponseSchema,
  type EditalAiRequest,
  type EditalAiResponse,
} from './edital-schema'

type FunctionInvoker = Pick<SupabaseClient, 'functions'>

export async function invokeIaExtraction(
  supabase: FunctionInvoker,
  request: EditalAiRequest,
): Promise<EditalAiResponse> {
  const parsedRequest = editalAiRequestSchema.parse(request)

  const { data, error } = await supabase.functions.invoke('ia', {
    body: parsedRequest,
  })

  if (error) {
    throw new Error(`Falha ao invocar a Edge Function ia: ${error.message}`)
  }

  return editalAiResponseSchema.parse(data)
}
