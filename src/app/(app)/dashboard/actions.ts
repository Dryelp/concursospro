'use server'

import { revalidatePath } from 'next/cache'

import type { StudyTask } from '@/lib/database.types'
import { todayIso } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export async function toggleTaskAction(formData: FormData) {
  const taskId = String(formData.get('taskId') ?? '')
  const status = String(formData.get('status') ?? 'pending') as StudyTask['status']
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !taskId) return

  const { data } = await supabase.from('study_tasks').update({ status })
    .eq('id', taskId).eq('user_id', user.id).select('*').maybeSingle()
  const task = data as StudyTask | null

  if (task && status === 'done') {
    const { data: review } = await supabase.from('review_items').select('id')
      .eq('study_task_id', task.id).eq('user_id', user.id).maybeSingle()
    if (!review) {
      const next = new Date(`${todayIso()}T12:00:00`)
      next.setDate(next.getDate() + 1)
      await supabase.from('review_items').insert({
        project_id: task.project_id, subject_id: task.subject_id, study_task_id: task.id,
        user_id: user.id, title: task.title, next_review_at: next.toISOString().slice(0, 10),
      })
    }
  }
  revalidatePath('/dashboard')
  revalidatePath('/cronograma')
  revalidatePath('/revisoes')
}
