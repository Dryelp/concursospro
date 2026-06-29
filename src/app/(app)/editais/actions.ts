'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, ExamProject } from '@/lib/database.types'
import { parseConteudoLocal } from '@/lib/editais/parse-conteudo'
import { callIA } from '@/lib/ia'
import { materiasResponseSchema, type MateriaExtraida } from '@/lib/schemas/ia'
import { createClient } from '@/lib/supabase/server'

export type CreateEditalState = {
  error?: string
  projectId?: string
  subjectCount?: number
}
const schema = z.object({
  titulo: z.string().trim().min(3, 'Informe o nome do concurso.').max(200),
  orgao: z.string().trim().max(150).optional(),
  cargo: z.string().trim().max(150).optional(),
  data_prova: z.string().optional().transform((value) => value || null),
  conteudo: z.string().trim().min(20, 'Cole o conteúdo programático.').max(100_000),
})

export async function createEditalAction(_state: CreateEditalState, formData: FormData): Promise<CreateEditalState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user) return { error: 'Sua sessão expirou.' }

  let subjects: MateriaExtraida[] = parseConteudoLocal(parsed.data.conteudo)
  if (subjects.length < 2 && session) {
    try {
      const result = await callIA([{
        role: 'user',
        content: `Identifique todas as disciplinas e seus tópicos no conteúdo programático abaixo. Não confunda capítulos, tópicos ou cabeçalhos gerais com disciplinas. Preserve os nomes oficiais. Retorne {"materias":[{"nome":"...","peso":1,"topicos":["..."]}]}.\n\nCONTEÚDO:\n${parsed.data.conteudo}`,
      }], {
        task: 'parse',
        maxTokens: 7000,
        schema: materiasResponseSchema,
        accessToken: session.access_token,
        retries: 0,
      })
      if (result.materias.length > subjects.length) {
        subjects = result.materias.map((subject) => ({
          nome: subject.nome,
          peso: subject.peso ?? 1,
          topicos: subject.topicos ?? [],
        }))
      }
    } catch (error) {
      console.error('[editais] fallback de IA falhou', error)
    }
  }
  const { data, error } = await supabase.from('exam_projects').insert({
    user_id: user.id, title: parsed.data.titulo, organization: parsed.data.orgao || null,
    position_name: parsed.data.cargo || null, exam_date: parsed.data.data_prova,
    source_type: 'plain-text', status: 'ready',
    extraction_status: subjects.length >= 2 ? 'ready' : 'review',
    progress: 10, summary: parsed.data.conteudo,
  }).select('*').single()
  const project = data as ExamProject | null
  if (error || !project) return { error: error?.message ?? 'Falha ao criar concurso.' }

  if (subjects.length) {
    const inserts: Database['public']['Tables']['subjects']['Insert'][] = subjects.map((subject) => ({
      project_id: project.id, user_id: user.id, name: subject.nome, weight: subject.peso,
      priority: Math.min(5, Math.max(1, subject.peso)), origin: 'extracted',
      confidence: 0.75, topic_count: subject.topicos.length, syllabus: subject.topicos,
    }))
    const { error: subjectError } = await supabase.from('subjects').insert(inserts)
    if (subjectError) return { error: subjectError.message }
  }
  revalidatePath('/', 'layout')
  return { projectId: project.id, subjectCount: subjects.length }
}

export async function deleteEditalAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && id) await supabase.from('exam_projects').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/', 'layout')
}
