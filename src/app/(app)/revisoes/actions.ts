'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, MockQuestion, ReviewItem, Subject } from '@/lib/database.types'
import { getExamBoardJsonExample, getExamBoardPromptContext } from '@/lib/bancas'
import { callIA } from '@/lib/ia'
import { questionHasRequiredHighlight } from '@/lib/question-text'
import { questionsSchema } from '@/lib/schemas/study-content'
import { addDaysIso, sm2 } from '@/lib/study'
import { todayIso } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export type RevisionQuestionsState = {
  error?: string
  questions?: MockQuestion[]
}

const revisionQuestionsSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topic: z.string().trim().min(3).max(240),
})

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

export async function startRevisionQuestionsAction(
  _state: RevisionQuestionsState,
  formData: FormData,
): Promise<RevisionQuestionsState> {
  const parsed = revisionQuestionsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Revisão sem tópico ou matéria suficiente para gerar questões.' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessão expirada.' }

  const [{ data: review }, { data: subject }, { data: project }] = await Promise.all([
    supabase
      .from('review_items')
      .select('id, project_id, subject_id')
      .eq('id', parsed.data.reviewId)
      .eq('project_id', parsed.data.projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('subjects')
      .select('*')
      .eq('id', parsed.data.subjectId)
      .eq('project_id', parsed.data.projectId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('exam_projects')
      .select('id, board')
      .eq('id', parsed.data.projectId)
      .eq('user_id', user.id)
      .single(),
  ])

  const typedSubject = subject as Subject | null
  if (!review || !typedSubject || typedSubject.project_id !== parsed.data.projectId) {
    return { error: 'Revisão inválida para este concurso.' }
  }

  const { data: existingRows } = await supabase
    .from('mock_questions')
    .select('*')
    .eq('project_id', parsed.data.projectId)
    .eq('subject_id', parsed.data.subjectId)
    .eq('user_id', user.id)
    .eq('topic', parsed.data.topic)
    .is('answered_at', null)
    .order('created_at', { ascending: false })
    .limit(3)

  const existing = (existingRows ?? []) as MockQuestion[]
  if (existing.length >= 3) return { questions: existing.slice(0, 3) }

  const missing = 3 - existing.length
  const { data: recentRows } = await supabase
    .from('mock_questions')
    .select('statement')
    .eq('project_id', parsed.data.projectId)
    .eq('subject_id', parsed.data.subjectId)
    .eq('user_id', user.id)
    .eq('topic', parsed.data.topic)
    .order('created_at', { ascending: false })
    .limit(12)

  const recentStatements = (recentRows ?? [])
    .map((question, index) => `${index + 1}. ${question.statement}`)
    .join('\n')
  const boardPromptContext = getExamBoardPromptContext(project?.board ?? null)
  const expectedJson = getExamBoardJsonExample(project?.board ?? null)

  try {
    const result = await callIA([{
      role: 'user',
      content: `Gere ${missing} questoes curtas de revisao para concurso publico brasileiro.

MATERIA: ${typedSubject.name}
TOPICO OBRIGATORIO: ${parsed.data.topic}

PERFIL DA BANCA:
${boardPromptContext}

Questoes recentes que nao devem ser repetidas:
${recentStatements || 'Nenhuma questao anterior neste topico.'}

Regras:
- questoes objetivas e focadas em revisar memoria, sem fugir do topico;
- respeite o formato da banca;
- nao repita enunciado, contexto, exemplo ou pegadinha;
- explique a regra central na explicacao;
- se a questao depender de palavra destacada, marque o termo com **dois asteriscos**.

Retorne somente JSON valido.
JSON esperado: ${expectedJson}`,
    }], {
      task: 'questao',
      maxTokens: 2200,
      schema: questionsSchema,
      accessToken: session.access_token,
      retries: 0,
      timeoutMs: 45_000,
    })

    const validQuestions = result.questions
      .filter((question) =>
        questionHasRequiredHighlight({
          statement: question.statement,
          alternatives: question.alternatives,
        }),
      )
      .slice(0, missing)

    if (!validQuestions.length) {
      return { error: 'A IA não marcou corretamente os destaques necessários. Tente novamente.' }
    }

    const inserts: Database['public']['Tables']['mock_questions']['Insert'][] = validQuestions.map((question) => ({
      project_id: parsed.data.projectId,
      subject_id: parsed.data.subjectId,
      user_id: user.id,
      statement: question.statement,
      alternatives: question.alternatives,
      correct_answer: question.correctAnswer.toUpperCase(),
      explanation: question.explanation,
      difficulty: 'medio',
      topic: parsed.data.topic,
    }))

    const { data: insertedRows, error } = await supabase
      .from('mock_questions')
      .insert(inserts)
      .select('*')

    if (error) return { error: error.message }

    revalidatePath('/revisoes')
    revalidatePath('/simulados')
    revalidatePath('/dashboard')

    return { questions: [...existing, ...((insertedRows ?? []) as MockQuestion[])].slice(0, 3) }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Falha ao gerar questões de revisão.',
    }
  }
}
