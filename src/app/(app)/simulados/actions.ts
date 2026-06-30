'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, Subject } from '@/lib/database.types'
import { getExamBoardJsonExample, getExamBoardPromptContext } from '@/lib/bancas'
import { callIA } from '@/lib/ia'
import { questionHasRequiredHighlight } from '@/lib/question-text'
import { questionsSchema } from '@/lib/schemas/study-content'
import { createClient } from '@/lib/supabase/server'

export type SimulationState = { error?: string; success?: string }

const formSchema = z.object({
  projectId: z.string().uuid(),
  subjectId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
  topic: z
    .string()
    .trim()
    .min(3, 'Escolha ou informe o topico das questoes.')
    .max(200),
})

const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedAnswer: z.string().trim().min(1).max(2),
})

export async function generateQuestionsAction(
  _state: SimulationState,
  formData: FormData,
): Promise<SimulationState> {
  const parsed = formSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessao expirada.' }

  const { data: subject } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', parsed.data.subjectId)
    .eq('user_id', user.id)
    .single()

  const typedSubject = subject as Subject | null
  if (!typedSubject || typedSubject.project_id !== parsed.data.projectId) {
    return { error: 'Materia invalida para este concurso.' }
  }

  const { data: project } = await supabase
    .from('exam_projects')
    .select('id, board')
    .eq('id', parsed.data.projectId)
    .eq('user_id', user.id)
    .single()

  const boardPromptContext = getExamBoardPromptContext(project?.board ?? null)
  const expectedJson = getExamBoardJsonExample(project?.board ?? null)

  try {
    const { data: recentQuestions } = await supabase
      .from('mock_questions')
      .select('statement')
      .eq('project_id', parsed.data.projectId)
      .eq('subject_id', typedSubject.id)
      .eq('user_id', user.id)
      .eq('topic', parsed.data.topic)
      .order('created_at', { ascending: false })
      .limit(12)

    const recentStatements = (recentQuestions ?? [])
      .map((question, index) => `${index + 1}. ${question.statement.slice(0, 500)}`)
      .join('\n')

    const repetitionGuard = recentStatements
      ? `\nENUNCIADOS RECENTES QUE NAO PODEM SER REPETIDOS NEM PARAFRASEADOS:\n${recentStatements}\n`
      : ''

    const result = await callIA([{
      role: 'user',
      content: `Gere ${parsed.data.quantity} questoes ineditas de concurso publico brasileiro.

MATERIA: ${typedSubject.name}
TOPICO OBRIGATORIO: ${parsed.data.topic}

PERFIL DA BANCA:
${boardPromptContext}
${repetitionGuard}

Regras:
- cobre somente o topico informado, sem questoes genericas da materia;
- nao repita enunciado, caso pratico, alternativa, pegadinha ou abordagem dos enunciados recentes;
- respeite fielmente o formato e o estilo da banca informado acima;
- varie dificuldade e forma de cobranca;
- explique por que a correta esta correta e por que a pegadinha pode confundir.
- se a questao usar palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque obrigatoriamente o termo com **dois asteriscos** no enunciado ou na alternativa. Exemplo: "A palavra **rapidamente** indica circunstancia de modo.";

FORMATO OBRIGATORIO:
- retorne apenas JSON valido, sem Markdown, sem texto antes ou depois;
- use aspas duplas em todas as chaves e strings;
- nao use virgula sobrando no ultimo item de arrays ou objetos;
- use exatamente o formato de alternativas indicado no perfil da banca.

JSON esperado: ${expectedJson}`,
    }], {
      task: 'questao',
      maxTokens: 3200,
      schema: questionsSchema,
      accessToken: session.access_token,
      retries: 0,
      timeoutMs: 60_000,
    })

    const validQuestions = result.questions.filter((question) =>
      questionHasRequiredHighlight({
        statement: question.statement,
        alternatives: question.alternatives,
      }),
    )

    if (!validQuestions.length) {
      return {
        error: 'A IA gerou questoes que dependiam de destaque, mas nao marcou o termo. Gere novamente.',
      }
    }

    const inserts: Database['public']['Tables']['mock_questions']['Insert'][] =
      validQuestions.map((question) => ({
        project_id: parsed.data.projectId,
        subject_id: typedSubject.id,
        user_id: user.id,
        statement: question.statement,
        alternatives: question.alternatives,
        correct_answer: question.correctAnswer.toUpperCase(),
        explanation: question.explanation,
        difficulty: 'medio',
        topic: parsed.data.topic,
      }))

    const { error } = await supabase.from('mock_questions').insert(inserts)
    if (error) return { error: error.message }

    revalidatePath('/simulados')
    return { success: `${validQuestions.length} questoes geradas.` }
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'Falha ao gerar questoes.',
    }
  }
}

export async function answerQuestionAction(formData: FormData) {
  const parsed = answerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: question } = await supabase
    .from('mock_questions')
    .select('id, correct_answer')
    .eq('id', parsed.data.questionId)
    .eq('user_id', user.id)
    .is('answered_at', null)
    .single()

  if (!question) return

  const selectedAnswer = parsed.data.selectedAnswer.toUpperCase()
  const now = new Date().toISOString()

  await supabase
    .from('mock_questions')
    .update({
      selected_answer: selectedAnswer,
      is_correct: selectedAnswer === question.correct_answer,
      answered_at: now,
      updated_at: now,
    })
    .eq('id', parsed.data.questionId)
    .eq('user_id', user.id)
    .is('answered_at', null)

  revalidatePath('/simulados')
}
