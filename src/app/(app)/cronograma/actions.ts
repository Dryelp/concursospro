'use server'

import { revalidatePath } from 'next/cache'

import type { Database, ExamProject, Subject } from '@/lib/database.types'
import { addDaysIso, deterministicSchedule, inferDailyStudyHours } from '@/lib/study'
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
    dailyHours: inferDailyStudyHours(typedProject.study_hours_per_week, typedProject.study_days),
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

function nextStudyDate(date: string, studyDays: number[]) {
  let cursor = date

  for (let attempts = 0; attempts < 14; attempts += 1) {
    const current = new Date(`${cursor}T12:00:00`)
    const weekDay = current.getDay() === 0 ? 7 : current.getDay()
    if (studyDays.includes(weekDay)) return cursor
    cursor = addDaysIso(cursor, 1)
  }

  return date
}

export async function rescheduleOverdueTasksAction(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !projectId) return

  const today = todayIso()
  const [{ data: project }, { data: overdueRows }, { data: futureRows }] = await Promise.all([
    supabase
      .from('exam_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('study_tasks')
      .select('id, scheduled_for, duration_min')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .neq('status', 'done')
      .lt('scheduled_for', today)
      .order('scheduled_for'),
    supabase
      .from('study_tasks')
      .select('scheduled_for, duration_min')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .gte('scheduled_for', today),
  ])

  const typedProject = project as ExamProject | null
  const overdue = (overdueRows ?? []) as Array<{ id: string; scheduled_for: string; duration_min: number }>
  const future = (futureRows ?? []) as Array<{ scheduled_for: string; duration_min: number }>
  if (!typedProject || !overdue.length) return

  const studyDays = typedProject.study_days.length ? typedProject.study_days : [1, 2, 3, 4, 5]
  const dailyLimit = inferDailyStudyHours(typedProject.study_hours_per_week, studyDays) * 60
  const plannedMinutes = new Map<string, number>()

  for (const task of future) {
    plannedMinutes.set(
      task.scheduled_for,
      (plannedMinutes.get(task.scheduled_for) ?? 0) + task.duration_min,
    )
  }

  let cursor = nextStudyDate(today, studyDays)

  for (const task of overdue) {
    while ((plannedMinutes.get(cursor) ?? 0) + task.duration_min > dailyLimit) {
      cursor = nextStudyDate(addDaysIso(cursor, 1), studyDays)
    }

    plannedMinutes.set(cursor, (plannedMinutes.get(cursor) ?? 0) + task.duration_min)
    await supabase
      .from('study_tasks')
      .update({ scheduled_for: cursor, status: 'delayed' })
      .eq('id', task.id)
      .eq('user_id', user.id)
  }

  revalidatePath('/cronograma')
  revalidatePath('/dashboard')
}
