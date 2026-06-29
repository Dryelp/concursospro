import { redirect } from 'next/navigation'

import type { ExamProject, Subject } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

export async function requireWorkspace(preferredProjectId?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projectRows } = await supabase
    .from('exam_projects').select('*').eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  const projects = (projectRows ?? []) as ExamProject[]
  const project = projects.find((item) => item.id === preferredProjectId) ?? projects[0] ?? null

  let subjects: Subject[] = []
  if (project) {
    const { data } = await supabase.from('subjects').select('*')
      .eq('user_id', user.id).eq('project_id', project.id)
      .order('priority', { ascending: false })
    subjects = (data ?? []) as Subject[]
  }

  return { supabase, user, projects, project, subjects }
}

export function syllabusTopics(subject: Subject): string[] {
  return Array.isArray(subject.syllabus)
    ? subject.syllabus.filter((item): item is string => typeof item === 'string')
    : []
}
