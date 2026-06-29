'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, Flashcard, Subject } from '@/lib/database.types'
import { todayIso } from '@/lib/format'
import { callIA } from '@/lib/ia'
import { flashcardsSchema } from '@/lib/schemas/study-content'
import { addDaysIso, sm2 } from '@/lib/study'
import { createClient } from '@/lib/supabase/server'

export type FlashState = { error?: string; success?: string }
const schema = z.object({ projectId: z.string().uuid(), subjectId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(30), topic: z.string().max(200).optional() })

export async function generateFlashcardsAction(_state: FlashState, formData: FormData): Promise<FlashState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessão expirada.' }
  const { data: subject } = await supabase.from('subjects').select('*').eq('id', parsed.data.subjectId).eq('user_id', user.id).single()
  const typedSubject = subject as Subject | null
  if (!typedSubject || typedSubject.project_id !== parsed.data.projectId) return { error: 'Matéria inválida para este concurso.' }
  try {
    const result = await callIA([{ role: 'user', content: `Gere ${parsed.data.quantity} flashcards sobre ${typedSubject.name}${parsed.data.topic ? `, tópico ${parsed.data.topic}` : ''}. Retorne somente JSON: {"cards":[{"front":"pergunta","back":"resposta"}]}` }], { task: 'flashcard', maxTokens: 3500, schema: flashcardsSchema, accessToken: session.access_token })
    const { data: deckData, error: deckError } = await supabase.from('flashcard_decks').insert({ project_id: parsed.data.projectId, subject_id: typedSubject.id, user_id: user.id, name: `${typedSubject.name} - ${new Date().toLocaleDateString('pt-BR')}` }).select('id').single()
    const deck = deckData as { id: string } | null
    if (deckError || !deck) return { error: deckError?.message ?? 'Falha ao criar baralho.' }
    const inserts: Database['public']['Tables']['flashcards']['Insert'][] = result.cards.map((card) => ({ deck_id: deck.id, project_id: parsed.data.projectId, subject_id: typedSubject.id, user_id: user.id, front: card.front, back: card.back, next_review_at: todayIso() }))
    const { error } = await supabase.from('flashcards').insert(inserts)
    if (error) {
      await supabase.from('flashcard_decks').delete().eq('id', deck.id).eq('user_id', user.id)
      return { error: error.message }
    }
    revalidatePath('/flashcards')
    return { success: `${result.cards.length} flashcards criados.` }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Falha ao gerar flashcards.' } }
}

export async function rateFlashcardAction(formData: FormData) {
  const id = String(formData.get('id') ?? ''); const score = Number(formData.get('score'))
  const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser()
  if (!user || !id || score < 1 || score > 5) return
  const { data } = await supabase.from('flashcards').select('*').eq('id', id).eq('user_id', user.id).single()
  const card = data as Flashcard | null; if (!card) return
  const next = sm2(card.ease_factor, card.interval_days, card.repetitions, score)
  await supabase.from('flashcards').update({ ease_factor: next.ease, interval_days: next.interval, repetitions: next.repetitions, last_score: score, last_reviewed_at: todayIso(), next_review_at: addDaysIso(todayIso(), next.interval) }).eq('id', id).eq('user_id', user.id)
  revalidatePath('/flashcards')
}
