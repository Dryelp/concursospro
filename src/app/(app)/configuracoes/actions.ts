'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

export type SettingsState = { error?: string; success?: string }

const schema = z.object({
  nome: z.string().trim().min(2).max(100),
  hours: z.coerce.number().int().min(1, 'Informe ao menos 1 hora por dia.').max(12, 'Use no maximo 12 horas por dia.'),
  days: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Escolha ao menos um dia de estudo.'),
  goal: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().optional(),
})

export async function saveSettingsAction(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = schema.safeParse({
    nome: formData.get('nome'),
    hours: formData.get('hours'),
    days: formData.getAll('days'),
    goal: formData.get('goal'),
    projectId: formData.get('projectId') || undefined,
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessao expirada.' }

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      nome: parsed.data.nome,
      hours_per_week: parsed.data.hours,
      study_days: parsed.data.days,
      study_goal: parsed.data.goal || null,
    },
    { onConflict: 'id' },
  )

  if (error) return { error: error.message }

  if (parsed.data.projectId) {
    await supabase
      .from('exam_projects')
      .update({
        study_hours_per_week: parsed.data.hours,
        study_days: parsed.data.days,
        focus_subject: parsed.data.goal || null,
      })
      .eq('id', parsed.data.projectId)
      .eq('user_id', user.id)
  }

  revalidatePath('/', 'layout')
  return { success: 'Preferencias salvas.' }
}
