'use server'

import { revalidatePath } from 'next/cache'

import type { ReviewItem } from '@/lib/database.types'
import { addDaysIso, sm2 } from '@/lib/study'
import { todayIso } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export async function rateReviewAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const score = Number(formData.get('score'))
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !id || score < 1 || score > 5) return
  const { data } = await supabase.from('review_items').select('*').eq('id', id).eq('user_id', user.id).single()
  const review = data as ReviewItem | null
  if (!review) return
  const next = sm2(review.ease_factor, review.interval_days, review.repetitions, score)
  await supabase.from('review_items').update({
    ease_factor: next.ease, interval_days: next.interval,
    repetitions: next.repetitions, last_score: score,
    last_reviewed_at: todayIso(), next_review_at: addDaysIso(todayIso(), next.interval),
  }).eq('id', id).eq('user_id', user.id)
  revalidatePath('/revisoes'); revalidatePath('/dashboard')
}
