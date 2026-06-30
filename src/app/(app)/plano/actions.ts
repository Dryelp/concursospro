'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { masteryValue } from '@/lib/study-plan'
import { createClient } from '@/lib/supabase/server'

const masterySchema = z.object({
  subjectId: z.string().uuid(),
  level: z.enum(['iniciante', 'intermediario', 'avancado']),
})

export async function updateSubjectMasteryAction(formData: FormData) {
  const parsed = masterySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('subjects')
    .update({ mastery: masteryValue(parsed.data.level), updated_at: new Date().toISOString() })
    .eq('id', parsed.data.subjectId)
    .eq('user_id', user.id)

  revalidatePath('/plano')
  revalidatePath('/cronograma')
  revalidatePath('/dashboard')
}
