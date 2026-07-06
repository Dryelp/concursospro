'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, MockSimulation, Subject } from '@/lib/database.types'
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
      .is('simulation_id', null)
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
- todas as questoes devem ter correctAnswer e explanation preenchidos; nunca deixe esses campos vazios ou ausentes;
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
        .is('simulation_id', null)
        .order('created_at', { ascending: false })
        .limit(40),
    ])

  const subjects = (subjectRows ?? []) as Subject[]
  if (!project || !subjects.length) {
    return { error: 'Adicione materias ao edital antes de gerar um simulado completo.' }
  }

  const structuredData = Array.isArray(extractionRows) ? extractionRows[0]?.structured_data : null
  const examStructure = resolveExamStructure(structuredData, subjects, project.board)
  const matrixQuestionTotal = examStructure.disciplines.reduce(
    (sum, discipline) => sum + (discipline.questionCount ?? 0),
    0,
  )
  const plan = buildSimulationPlan(
    examStructure,
    subjects,
    Math.max(examStructure.totalQuestions ?? 0, matrixQuestionTotal, 80),
  )
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
  const now = new Date().toISOString()
  const simulationInsert: Database['public']['Tables']['mock_simulations']['Insert'] = {
    project_id: parsed.data.projectId,
    user_id: user.id,
    title: `${project.title} - Simulado ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`,
    status: 'generating',
    total_questions: plan.generatedTotal,
    duration_minutes: examStructure.durationMinutes,
    exam_format: examStructure.format,
    distribution: plan.items.map((item) => ({
      subjectName: item.subject.name,
      questionCount: item.questionCount,
      topic: item.topic,
    })),
  }

  const { data: simulation, error: simulationError } = await supabase
    .from('mock_simulations')
    .insert(simulationInsert)
    .select('*')
    .single()

  if (simulationError || !simulation) {
    return { error: simulationError?.message ?? 'Nao foi possivel criar o simulado.' }
  }
  const createdSimulation = simulation as MockSimulation

  try {
    const usedStatements = new Set(
      recentStatements
        .split('\n')
        .map((statement) => statement.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase())
        .filter(Boolean),
    )
    const validQuestions: Array<
      z.infer<typeof fullSimulationQuestionsSchema>['questions'][number] & { subject: Subject }
    > = []

    for (const item of plan.items) {
      let remaining = item.questionCount
      let attempts = 0
      const topics = Array.isArray(item.subject.syllabus)
        ? item.subject.syllabus
          .filter((topic): topic is string => typeof topic === 'string' && topic.trim().length > 2)
          .slice(0, 12)
          .join('; ')
        : item.topic

      while (remaining > 0 && attempts < Math.ceil(item.questionCount / 10) + 2) {
        attempts += 1
        const batchSize = Math.min(10, remaining)
        const batch = await callIA([{
          role: 'user',
          content: `Gere ${batchSize} questoes para uma PARTE de um simulado completo de concurso publico brasileiro.

CONCURSO: ${project.title}
ESTRUTURA DA PROVA: ${formatExamStructureLabel(examStructure)}
MATERIA OBRIGATORIA: ${item.subject.name}
TOPICOS DO EDITAL PARA ESTA MATERIA: ${topics || item.subject.name}

PERFIL DA BANCA:
${boardPromptContext}

DISTRIBUICAO COMPLETA DO SIMULADO:
${distribution}

QUESTOES RECENTES OU JA GERADAS QUE NAO PODEM SER REPETIDAS:
${[recentStatements, ...validQuestions.slice(-20).map((question) => question.statement)].filter(Boolean).join('\n') || 'Nenhuma questao recente.'}

Regras:
- gere exatamente ${batchSize} questoes;
- todas as questoes devem ser da materia "${item.subject.name}";
- cada questao deve trazer subjectName exatamente como "${item.subject.name}";
- escolha topic com um topico real do edital dessa materia;
- nao repita enunciado, caso pratico, pegadinha ou alternativa das questoes recentes;
- respeite o formato da banca e a quantidade de alternativas;
- todas as questoes devem ter subjectName, statement, alternatives, correctAnswer e explanation preenchidos;
- explique a regra cobrada e por que o distrator principal confunde;
- se houver palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque o termo com **dois asteriscos**.

Retorne somente JSON valido.
Formato base das alternativas: ${expectedJson}
JSON esperado para cada questao: {"subjectName":"${item.subject.name}","topic":"Topico do edital","statement":"...","alternatives":[],"correctAnswer":"A","explanation":"..."}`,
        }], {
          task: 'questao',
          maxTokens: Math.max(2600, batchSize * 650),
          schema: fullSimulationQuestionsSchema,
          accessToken: session.access_token,
          retries: 0,
          timeoutMs: 60_000,
        })

        const accepted = batch.questions
          .map((question) => ({
            ...question,
            subjectName: item.subject.name,
            subject: subjectByName.get(normalizeSubjectName(question.subjectName)) ?? item.subject,
          }))
          .filter((question) => {
            const statementKey = question.statement.replace(/\s+/g, ' ').trim().toLowerCase()
            if (!question.subject || usedStatements.has(statementKey)) return false
            if (!questionHasRequiredHighlight({
              statement: question.statement,
              alternatives: question.alternatives,
            })) return false

            usedStatements.add(statementKey)
            return true
          })
          .slice(0, remaining)

        validQuestions.push(...accepted)
        remaining -= accepted.length

        if (!accepted.length) break
      }
    }

    if (!validQuestions.length) {
      await supabase
        .from('mock_simulations')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', createdSimulation.id)
        .eq('user_id', user.id)

      return { error: 'A IA nao retornou questoes validas para a matriz da prova. Tente novamente.' }
    }

    const inserts: Database['public']['Tables']['mock_questions']['Insert'][] =
      validQuestions.map((question) => ({
        project_id: parsed.data.projectId,
        subject_id: question.subject?.id ?? null,
        simulation_id: createdSimulation.id,
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

    await supabase
      .from('mock_simulations')
      .update({
        status: 'not_started',
        total_questions: validQuestions.length,
        updated_at: now,
      })
      .eq('id', createdSimulation.id)
      .eq('user_id', user.id)

    revalidatePath('/simulados')
    return {
      success: plan.scaled
        ? `${validQuestions.length} questoes geradas no simulado isolado. A matriz real tem ${plan.originalTotal}.`
        : `${validQuestions.length} questoes geradas no simulado isolado.`,
    }
  } catch (error) {
    await supabase
      .from('mock_simulations')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', createdSimulation.id)
      .eq('user_id', user.id)

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

  const { data: updatedQuestion } = await supabase
    .from('mock_questions')
    .select('simulation_id')
    .eq('id', parsed.data.questionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (updatedQuestion?.simulation_id) {
    const [{ count: total }, { count: answered }, { count: correct }] = await Promise.all([
      supabase
        .from('mock_questions')
        .select('id', { count: 'exact', head: true })
        .eq('simulation_id', updatedQuestion.simulation_id)
        .eq('user_id', user.id),
      supabase
        .from('mock_questions')
        .select('id', { count: 'exact', head: true })
        .eq('simulation_id', updatedQuestion.simulation_id)
        .eq('user_id', user.id)
        .not('answered_at', 'is', null),
      supabase
        .from('mock_questions')
        .select('id', { count: 'exact', head: true })
        .eq('simulation_id', updatedQuestion.simulation_id)
        .eq('user_id', user.id)
        .eq('is_correct', true),
    ])

    const status = answered && total && answered >= total ? 'completed' : 'in_progress'
    const simulationUpdate: Database['public']['Tables']['mock_simulations']['Update'] = {
      status,
      score: total ? Math.round(((correct ?? 0) / total) * 100) : null,
      updated_at: now,
    }

    if (status === 'in_progress') {
      simulationUpdate.started_at = now
    } else {
      simulationUpdate.completed_at = now
    }

    await supabase
      .from('mock_simulations')
      .update(simulationUpdate)
      .eq('id', updatedQuestion.simulation_id)
      .eq('user_id', user.id)
  }

  revalidatePath('/revisoes')
  revalidatePath('/dashboard')
  revalidatePath('/simulados')
}
