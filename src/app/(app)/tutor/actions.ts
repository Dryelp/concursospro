'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { ChatMessage, ExamProject } from '@/lib/database.types'
import { callIA } from '@/lib/ia'
import { createClient } from '@/lib/supabase/server'
import { buildStudentContextForTutor } from '@/lib/tutor-context'

export type TutorState = { error?: string }

const schema = z.object({
  projectId: z.string().uuid(),
  message: z.string().trim().min(2).max(4000),
})

export async function sendTutorMessageAction(
  _state: TutorState,
  formData: FormData,
): Promise<TutorState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessao expirada.' }

  const [{ data: projectData }, { data: historyData }] = await Promise.all([
    supabase
      .from('exam_projects')
      .select('*')
      .eq('id', parsed.data.projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('chat_messages')
      .select('*')
      .eq('project_id', parsed.data.projectId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(18),
  ])

  const project = projectData as ExamProject | null
  const history = [...((historyData ?? []) as ChatMessage[])].reverse()
  if (!project) return { error: 'Concurso invalido.' }

  try {
    const context = await buildStudentContextForTutor({
      supabase,
      userId: user.id,
      project,
    })
    const messages = [
      { role: 'user' as const, content: `[CONTEXTO]\n${context}` },
      { role: 'assistant' as const, content: 'Contexto recebido.' },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user' as const, content: parsed.data.message },
    ]
    const response = await callIA(messages, {
      task: 'tutor',
      maxTokens: 2200,
      accessToken: session.access_token,
    })
    const { error: insertError } = await supabase.from('chat_messages').insert([
      { project_id: project.id, user_id: user.id, role: 'user', content: parsed.data.message },
      { project_id: project.id, user_id: user.id, role: 'assistant', content: response },
    ])

    if (insertError) {
      return { error: `Falha ao salvar a conversa: ${insertError.message}` }
    }

    revalidatePath('/tutor')
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao consultar o tutor.' }
  }
}
