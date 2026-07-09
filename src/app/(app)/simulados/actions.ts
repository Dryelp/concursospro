'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Database, MockSimulation, Subject } from '@/lib/database.types'
import {
  formatExamStructureLabel,
  normalizeSubjectName,
  resolveExamStructure,
  type ExamStructure,
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

type MatrixSimulationItem = {
  subject: Subject
  matrixSubjectName: string
  matrixSubjectOrder: number
  questionCount: number
  topics: string[]
  plannedTopics: string[]
}

type PlannedQuestion = z.infer<typeof fullSimulationQuestionsSchema>['questions'][number] & {
  subject: Subject
  matrixSubjectName: string
  matrixSubjectOrder: number
  plannedTopic: string
  simulationOrder: number
}

function syllabusOf(subject: Subject) {
  return Array.isArray(subject.syllabus)
    ? subject.syllabus.filter((topic): topic is string => typeof topic === 'string')
    : []
}

function cleanStudyTopic(value: string | null | undefined, forbiddenNames: string[]) {
  const topic = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (topic.length < 4) return null

  const normalizedTopic = normalizeSubjectName(topic)
  if (!normalizedTopic) return null
  if (forbiddenNames.some((name) => normalizedTopic === normalizeSubjectName(name))) return null
  if (/^\d+(?:[,.]\d+)?\s*(?:pontos?|quest(?:ao|oes|oes))$/.test(normalizedTopic)) return null
  if (/^(?:pontos?|pontuacao|valor|nota)\b/.test(normalizedTopic)) return null
  if (/^(?:conhecimentos?|conteudo programatico|materia|disciplina)$/.test(normalizedTopic)) return null

  return topic
}

function uniqueTopics(values: Array<string | null>, forbiddenNames: string[]) {
  const seen = new Set<string>()
  const topics: string[] = []

  for (const value of values) {
    const topic = cleanStudyTopic(value, forbiddenNames)
    if (!topic) continue

    const key = normalizeSubjectName(topic)
    if (seen.has(key)) continue

    seen.add(key)
    topics.push(topic)
  }

  return topics
}

function matrixKeywords(name: string) {
  const key = normalizeSubjectName(name)

  if (key.includes('ciencias naturais')) {
    return [
      'fisica',
      'quimica',
      'biologia',
      'atomos',
      'moleculas',
      'ions',
      'reacoes quimicas',
      'ligacoes quimicas',
      'estequiometria',
      'solucoes',
      'cinetica',
      'equilibrio',
      'eletroquimica',
      'gases',
      'termodinamica',
      'hidrostatica',
      'eletricidade',
      'fluidos',
    ]
  }

  if (key.includes('ciencias humanas')) {
    return [
      'historia',
      'geografia',
      'sociologia',
      'filosofia',
      'relevo',
      'vegetacao',
      'hidrografia',
      'rios',
      'nascentes',
      'mineracao',
      'minerais',
      'cidades historicas',
      'inconfidencia',
      'escravidao',
      'ciclo do ouro',
      'cafe',
      'urbanizacao',
      'cultura',
      'minas gerais',
      'regioes',
    ]
  }

  if (key.includes('lingua portuguesa') || key.includes('portugues')) {
    return ['portugues', 'ortografia', 'acentuacao', 'crase', 'concordancia', 'regencia', 'sintaxe', 'interpretacao', 'texto']
  }

  if (key.includes('raciocinio') || key.includes('matematico')) {
    return ['raciocinio', 'logico', 'matematica', 'porcentagem', 'probabilidade', 'proposicao', 'equacao']
  }

  if (key.includes('direitos humanos') || key.includes('legislacao')) {
    return ['direitos humanos', 'legislacao', 'constitucional', 'estatuto', 'lei', 'normas']
  }

  if (key.includes('defesa civil')) {
    return ['defesa civil', 'protecao civil', 'desastres', 'riscos', 'barragens', 'emergencia', 'prevencao']
  }

  return key.split(' ').filter((token) => token.length > 3)
}

function subjectMatchesMatrix(subject: Subject, disciplineName: string) {
  const subjectKey = normalizeSubjectName(subject.name)
  const disciplineKey = normalizeSubjectName(disciplineName)
  if (!subjectKey || !disciplineKey) return false
  if (subjectKey === disciplineKey) return true
  if (subjectKey.includes(disciplineKey) || disciplineKey.includes(subjectKey)) return true

  const haystack = normalizeSubjectName([subject.name, ...syllabusOf(subject)].join(' '))
  return matrixKeywords(disciplineName).some((keyword) => {
    const key = normalizeSubjectName(keyword)
    return key.length > 3 && haystack.includes(key)
  })
}

function balanceQuestionCounts(items: MatrixSimulationItem[], targetTotal: number) {
  if (!items.length || targetTotal <= 0) return items

  let currentTotal = items.reduce((sum, item) => sum + item.questionCount, 0)
  let cursor = 0

  while (currentTotal < targetTotal) {
    items[cursor % items.length].questionCount += 1
    currentTotal += 1
    cursor += 1
  }

  cursor = items.length - 1
  while (currentTotal > targetTotal && items.some((item) => item.questionCount > 1)) {
    const item = items[Math.max(0, cursor % items.length)]
    if (item.questionCount > 1) {
      item.questionCount -= 1
      currentTotal -= 1
    }
    cursor -= 1
  }

  return items
}

function buildMatrixSimulationPlan(
  examStructure: ExamStructure,
  subjects: Subject[],
): MatrixSimulationItem[] {
  const subjectByName = new Map(subjects.map((subject) => [normalizeSubjectName(subject.name), subject]))
  const disciplines = examStructure.disciplines.filter((discipline) => (discipline.questionCount ?? 0) > 0)
  const baseItems = disciplines.map<MatrixSimulationItem | null>((discipline, index) => {
    const exactSubject = subjectByName.get(normalizeSubjectName(discipline.name)) ?? null
    const relatedSubjects = subjects.filter((subject) => subjectMatchesMatrix(subject, discipline.name))
    const subject = exactSubject ?? relatedSubjects[0] ?? subjects[index % subjects.length]
    if (!subject) return null

    const forbiddenNames = [discipline.name, subject.name]
    const relatedTopics = uniqueTopics(
      [
        ...relatedSubjects.flatMap((relatedSubject) => syllabusOf(relatedSubject)),
        ...relatedSubjects.map((relatedSubject) => relatedSubject.name),
        discipline.notes,
      ],
      forbiddenNames,
    )
    const topics = relatedTopics.length ? relatedTopics : [discipline.name]
    const questionCount = Math.max(1, discipline.questionCount ?? 1)

    return {
      subject,
      matrixSubjectName: discipline.name,
      matrixSubjectOrder: index + 1,
      questionCount,
      topics,
      plannedTopics: [],
    }
  }).filter((item): item is MatrixSimulationItem => Boolean(item))

  if (!baseItems.length) return []

  const matrixTotal = baseItems.reduce((sum, item) => sum + item.questionCount, 0)
  const targetTotal = Math.max(examStructure.totalQuestions ?? 0, matrixTotal)
  const balanced = balanceQuestionCounts(baseItems, targetTotal)

  return balanced.map((item) => ({
    ...item,
    plannedTopics: Array.from({ length: item.questionCount }, (_, index) =>
      item.topics[index % item.topics.length] ?? item.matrixSubjectName,
    ),
  }))
}

function jsonExampleForExamStructure(structure: ExamStructure, board: string | null) {
  const fromStructure = structure.format === 'true_false'
    ? ['C', 'E']
    : structure.format === 'multiple_choice_a_d'
      ? ['A', 'B', 'C', 'D']
      : null

  if (!fromStructure) return getExamBoardJsonExample(board)

  const items = fromStructure.map((letter) => {
    const text = structure.format === 'true_false'
      ? (letter === 'C' ? 'Certo' : 'Errado')
      : '...'
    return `{"letter":"${letter}","text":"${text}"}`
  })

  return `{"questions":[{"subjectName":"...","topic":"...","statement":"...","alternatives":[${items.join(',')}],"correctAnswer":"${fromStructure[0]}","explanation":"..."}]}`
}

function examFormatInstruction(structure: ExamStructure) {
  if (structure.format === 'true_false') {
    return 'Formato extraido do edital: julgamento Certo/Errado, exatamente 2 alternativas C e E.'
  }

  if (structure.format === 'multiple_choice_a_d') {
    return 'Formato extraido do edital: multipla escolha com exatamente 4 alternativas A, B, C e D.'
  }

  if (structure.format === 'multiple_choice_a_e') {
    return 'Formato extraido do edital: multipla escolha com exatamente 5 alternativas A, B, C, D e E.'
  }

  return 'Formato do edital nao confirmado; siga o formato informado no perfil da banca.'
}

function topicPlanText(topics: string[], startOrder: number) {
  return topics
    .map((topic, index) => `${startOrder + index}. ${topic}`)
    .join('\n')
}

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
  const plan = buildMatrixSimulationPlan(examStructure, subjects)
  const expectedTotal = plan.reduce((sum, item) => sum + item.questionCount, 0)

  if (!plan.length || !expectedTotal) {
    return { error: 'Nao foi possivel montar a distribuicao do simulado.' }
  }

  const distribution = plan
    .map((item) =>
      `- ${item.matrixSubjectName}: ${item.questionCount} questoes. Topicos planejados: ${item.topics.slice(0, 18).join('; ')}.`,
    )
    .join('\n')
  const recentStatements = (recentRows ?? [])
    .map((question, index) => `${index + 1}. ${String(question.statement).slice(0, 350)}`)
    .join('\n')
  const boardPromptContext = getExamBoardPromptContext(project.board)
  const expectedJson = jsonExampleForExamStructure(examStructure, project.board)
  const now = new Date().toISOString()
  const simulationInsert: Database['public']['Tables']['mock_simulations']['Insert'] = {
    project_id: parsed.data.projectId,
    user_id: user.id,
    title: `${project.title} - Simulado ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`,
    status: 'generating',
    total_questions: expectedTotal,
    expected_questions: expectedTotal,
    generated_questions: 0,
    duration_minutes: examStructure.durationMinutes,
    exam_format: examStructure.format,
    distribution: plan.map((item) => ({
      subjectName: item.matrixSubjectName,
      questionCount: item.questionCount,
      topics: item.topics,
      matrixSubjectOrder: item.matrixSubjectOrder,
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
    const validQuestions: PlannedQuestion[] = []
    let simulationOrder = 1

    for (const item of plan) {
      const generatedForItem: PlannedQuestion[] = []
      let attempts = 0
      let remaining = item.questionCount

      while (remaining > 0 && attempts < Math.ceil(item.questionCount / 8) + 4) {
        attempts += 1
        const batchSize = Math.min(8, remaining)
        const startOrder = simulationOrder + generatedForItem.length
        const plannedTopics = item.plannedTopics.slice(generatedForItem.length, generatedForItem.length + batchSize)
        const topicPlan = topicPlanText(plannedTopics, startOrder)

        const batch = await callIA([{
          role: 'user',
          content: `Gere ${batchSize} questoes para uma PARTE de um simulado completo de concurso publico brasileiro.

CONCURSO: ${project.title}
ESTRUTURA DA PROVA: ${formatExamStructureLabel(examStructure)}
DISCIPLINA DA MATRIZ: ${item.matrixSubjectName}
${examFormatInstruction(examStructure)}

PLANO OBRIGATORIO DESTA PARTE:
${topicPlan}

PERFIL DA BANCA:
${boardPromptContext}

DISTRIBUICAO COMPLETA DO SIMULADO:
${distribution}

QUESTOES RECENTES OU JA GERADAS QUE NAO PODEM SER REPETIDAS:
${[recentStatements, ...validQuestions.slice(-25).map((question) => question.statement), ...generatedForItem.slice(-10).map((question) => question.statement)].filter(Boolean).join('\n') || 'Nenhuma questao recente.'}

Regras:
- gere exatamente ${batchSize} questoes;
- mantenha a ordem do PLANO OBRIGATORIO: a primeira questao usa o primeiro topico listado, a segunda usa o segundo, e assim por diante;
- todas as questoes devem ser da disciplina da matriz "${item.matrixSubjectName}";
- cada questao deve trazer subjectName exatamente como "${item.matrixSubjectName}";
- o campo topic deve repetir o topico planejado correspondente, sem inventar outro assunto;
- nao repita enunciado, caso pratico, pegadinha ou alternativa das questoes recentes;
- respeite o formato extraido do edital acima; se ele contradisser o padrao da banca, o edital prevalece;
- todas as questoes devem ter subjectName, statement, alternatives, correctAnswer e explanation preenchidos;
- explique a regra cobrada e por que o distrator principal confunde;
- nao use assuntos fora dos topicos planejados desta parte;
- se houver palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque o termo com **dois asteriscos**.

Retorne somente JSON valido.
Formato base das alternativas: ${expectedJson}
JSON esperado para cada questao: {"subjectName":"${item.matrixSubjectName}","topic":"Topico planejado","statement":"...","alternatives":[],"correctAnswer":"A","explanation":"..."}`,
        }], {
          task: 'questao',
          maxTokens: Math.max(3200, batchSize * 850),
          schema: fullSimulationQuestionsSchema,
          accessToken: session.access_token,
          retries: 0,
          timeoutMs: 60_000,
        })

        const accepted = batch.questions
          .map((question, index) => {
            const plannedTopic = plannedTopics[index] ?? item.plannedTopics[generatedForItem.length + index] ?? item.matrixSubjectName

            return {
              ...question,
              subjectName: item.matrixSubjectName,
              topic: plannedTopic,
              subject: item.subject,
              matrixSubjectName: item.matrixSubjectName,
              matrixSubjectOrder: item.matrixSubjectOrder,
              plannedTopic,
              simulationOrder: startOrder + index,
            }
          })
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

        generatedForItem.push(...accepted)
        remaining -= accepted.length
      }

      validQuestions.push(...generatedForItem)
      simulationOrder += item.questionCount
    }

    if (validQuestions.length !== expectedTotal) {
      await supabase
        .from('mock_simulations')
        .update({
          status: 'failed',
          generated_questions: validQuestions.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdSimulation.id)
        .eq('user_id', user.id)

      return {
        error: `A IA gerou ${validQuestions.length}/${expectedTotal} questoes completas. Nao salvei como simulado pronto para evitar prova incompleta. Tente novamente.`,
      }
    }

    const inserts: Database['public']['Tables']['mock_questions']['Insert'][] =
      validQuestions.map((question) => ({
        project_id: parsed.data.projectId,
        subject_id: question.subject.id,
        simulation_id: createdSimulation.id,
        simulation_order: question.simulationOrder,
        matrix_subject_name: question.matrixSubjectName,
        matrix_subject_order: question.matrixSubjectOrder,
        planned_topic: question.plannedTopic,
        user_id: user.id,
        statement: question.statement,
        alternatives: question.alternatives,
        correct_answer: question.correctAnswer.toUpperCase(),
        explanation: question.explanation,
        difficulty: 'medio',
        topic: question.plannedTopic,
      }))

    const { error } = await supabase.from('mock_questions').insert(inserts)
    if (error) {
      await supabase
        .from('mock_simulations')
        .update({
          status: 'failed',
          generated_questions: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdSimulation.id)
        .eq('user_id', user.id)

      return { error: error.message }
    }

    await supabase
      .from('mock_simulations')
      .update({
        status: 'not_started',
        total_questions: expectedTotal,
        expected_questions: expectedTotal,
        generated_questions: validQuestions.length,
        updated_at: now,
      })
      .eq('id', createdSimulation.id)
      .eq('user_id', user.id)

    revalidatePath('/simulados')
    return {
      success: `${validQuestions.length} questoes geradas no simulado isolado, na ordem da matriz do edital.`,
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
