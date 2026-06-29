'use server'

import { revalidatePath } from 'next/cache'

import type { Database, ExamProject, Subject } from '@/lib/database.types'
import { deterministicSchedule } from '@/lib/study'
import { todayIso } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export async function generateScheduleAction(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !projectId) return

  const [{ data: project }, { data: subjects }] = await Promise.all([
    supabase.from('exam_projects').select('*').eq('id', projectId).eq('user_id', user.id).single(),
    supabase.from('subjects').select('*').eq('project_id', projectId).eq('user_id', user.id).order('priority', { ascending: false }),
  ])
  const typedProject = project as ExamProject | null
  const typedSubjects = (subjects ?? []) as Subject[]
  if (!typedProject || !typedSubjects.length) return
  const daysToExam = typedProject.exam_date
    ? Math.ceil((new Date(`${typedProject.exam_date}T12:00:00`).getTime() - new Date(`${todayIso()}T12:00:00`).getTime()) / 86400000)
    : 42
  if (daysToExam < 0) return
  const rows = deterministicSchedule({
    subjects: typedSubjects, start: todayIso(), days: typedProject.study_days,
    weeklyHours: typedProject.study_hours_per_week,
    totalDays: typedProject.exam_date ? Math.max(1, Math.min(90, daysToExam + 1)) : 42,
  })
  const inserts: Database['public']['Tables']['study_tasks']['Insert'][] = rows.map((row) => ({
    project_id: projectId, subject_id: row.subject.id, user_id: user.id,
    title: row.title, notes: row.notes, scheduled_for: row.date, duration_min: row.duration,
    task_type: row.type, source: 'manual', status: 'pending', confidence: 0.8,
  }))
  const { data: inserted, error: insertError } = await supabase.from('study_tasks').insert(inserts).select('id')
  if (insertError || !inserted?.length) return
  const insertedIds = inserted.map((item) => item.id)
  await supabase.from('study_tasks').delete().eq('project_id', projectId).eq('user_id', user.id)
    .neq('status', 'done').not('id', 'in', `(${insertedIds.join(',')})`)
  revalidatePath('/cronograma')
  revalidatePath('/dashboard')
}
