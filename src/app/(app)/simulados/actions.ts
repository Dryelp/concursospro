'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, Subject } from '@/lib/database.types'
import {
  buildSimulationPlan,
  formatExamStructureLabel,
  normalizeSubjectName,
  resolveExamStructure,
} from '@/lib/exam-structure'
import { getExamBoardJsonExample, getExamBoardPromptContext } from '@/lib/bancas'
import { callIA } from '@/lib/ia'
import { questionHasRequiredHighlight } from '@/lib/question-text'
import { fullSimulationQuestionsSchema, questionsSchema } from '@/lib/schemas/study-content'
import { createClient } from '@/lib/supabase/server'

export type SimulationState = { error?: string; success?: string }
export type FullSimulationState = { error?: string; success?: string }

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

const fullSimulationSchema = z.object({
  projectId: z.string().uuid(),
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

export async function generateFullSimulationAction(
  _state: FullSimulationState,
  formData: FormData,
): Promise<FullSimulationState> {
  const parsed = fullSimulationSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessao expirada.' }

  const [{ data: project }, { data: subjectRows }, { data: extractionRows }, { data: recentRows }] =
    await Promise.all([
      supabase
        .from('exam_projects')
        .select('id, board, title')
        .eq('id', parsed.data.projectId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('subjects')
        .select('*')
        .eq('project_id', parsed.data.projectId)
        .eq('user_id', user.id)
        .order('priority', { ascending: false }),
      supabase
        .from('edital_extraction_runs')
        .select('structured_data')
        .eq('project_id', parsed.data.projectId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('mock_questions')
        .select('statement')
        .eq('project_id', parsed.data.projectId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40),
    ])

  const subjects = (subjectRows ?? []) as Subject[]
  if (!project || !subjects.length) {
    return { error: 'Adicione materias ao edital antes de gerar um simulado completo.' }
  }

  const structuredData = Array.isArray(extractionRows) ? extractionRows[0]?.structured_data : null
  const examStructure = resolveExamStructure(structuredData, subjects, project.board)
  const plan = buildSimulationPlan(examStructure, subjects, 30)
  if (!plan.items.length || !plan.generatedTotal) {
    return { error: 'Nao foi possivel montar a distribuicao do simulado.' }
  }

  const subjectByName = new Map(subjects.map((subject) => [normalizeSubjectName(subject.name), subject]))
  const distribution = plan.items
    .map((item) => {
      const topics = Array.isArray(item.subject.syllabus)
        ? item.subject.syllabus
          .filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 2)
          .slice(0, 8)
          .join('; ')
        : ''

      return `- ${item.subject.name}: ${item.questionCount} questoes. Topicos do edital: ${topics || item.subject.name}.`
    })
    .join('\n')
  const recentStatements = (recentRows ?? [])
    .map((question, index) => `${index + 1}. ${String(question.statement).slice(0, 350)}`)
    .join('\n')
  const boardPromptContext = getExamBoardPromptContext(project.board)
  const expectedJson = getExamBoardJsonExample(project.board)

  try {
    const result = await callIA([{
      role: 'user',
      content: `Gere um simulado de concurso publico brasileiro seguindo a matriz abaixo.

CONCURSO: ${project.title}
ESTRUTURA DA PROVA: ${formatExamStructureLabel(examStructure)}
${plan.scaled ? `ATENCAO: a prova real tem ${plan.originalTotal} questoes mapeadas, mas gere uma versao proporcional com ${plan.generatedTotal} questoes para caber no tempo da plataforma.` : ''}

PERFIL DA BANCA:
${boardPromptContext}

DISTRIBUICAO OBRIGATORIA:
${distribution}

QUESTOES RECENTES QUE NAO PODEM SER REPETIDAS:
${recentStatements || 'Nenhuma questao recente.'}

Regras:
- gere exatamente ${plan.generatedTotal} questoes;
- respeite a quantidade por materia indicada na distribuicao;
- cada questao deve trazer subjectName exatamente igual ao nome da materia informada;
- escolha topic com um topico real do edital daquela materia;
- nao repita enunciado, caso pratico, pegadinha ou alternativa das questoes recentes;
- respeite o formato da banca e a quantidade de alternativas;
- explique a regra cobrada e por que o distrator principal confunde;
- se houver palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque o termo com **dois asteriscos**.

Retorne somente JSON valido.
Formato base das alternativas: ${expectedJson}
JSON esperado para cada questao: {"subjectName":"Nome exato da materia","topic":"Topico do edital","statement":"...","alternatives":[],"correctAnswer":"A","explanation":"..."}`,
    }], {
      task: 'questao',
      maxTokens: 7800,
      schema: fullSimulationQuestionsSchema,
      accessToken: session.access_token,
      retries: 0,
      timeoutMs: 90_000,
    })

    const validQuestions = result.questions
      .map((question) => ({
        ...question,
        subject: subjectByName.get(normalizeSubjectName(question.subjectName)),
      }))
      .filter((question) =>
        question.subject &&
        questionHasRequiredHighlight({
          statement: question.statement,
          alternatives: question.alternatives,
        }),
      )

    if (!validQuestions.length) {
      return { error: 'A IA nao retornou questoes validas para a matriz da prova. Tente novamente.' }
    }

    const inserts: Database['public']['Tables']['mock_questions']['Insert'][] =
      validQuestions.map((question) => ({
        project_id: parsed.data.projectId,
        subject_id: question.subject?.id ?? null,
        user_id: user.id,
        statement: question.statement,
        alternatives: question.alternatives,
        correct_answer: question.correctAnswer.toUpperCase(),
        explanation: question.explanation,
        difficulty: 'medio',
        topic: question.topic ?? 'Simulado completo',
      }))

    const { error } = await supabase.from('mock_questions').insert(inserts)
    if (error) return { error: error.message }

    revalidatePath('/simulados')
    return {
      success: plan.scaled
        ? `${validQuestions.length} questoes geradas em versao proporcional da prova.`
        : `${validQuestions.length} questoes geradas seguindo a matriz da prova.`,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Falha ao gerar simulado completo.',
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

  revalidatePath('/revisoes')
  revalidatePath('/dashboard')
}
