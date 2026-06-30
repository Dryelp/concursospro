'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Sparkles } from 'lucide-react'

import {
  getExamBoardJsonExample,
  getExamBoardProfile,
  getExamBoardPromptContext,
} from '@/lib/bancas'
import type { Database, Subject } from '@/lib/database.types'
import { callIA } from '@/lib/ia'
import { questionHasRequiredHighlight } from '@/lib/question-text'
import { questionsSchema } from '@/lib/schemas/study-content'
import { createClient } from '@/lib/supabase/client'

type SimulationState = { error?: string; success?: string }

type RecentQuestion = {
  subject_id: string | null
  topic: string | null
  statement: string
}

function GenerateButton({ pending }: { pending: boolean }) {
  return (
    <button className="button-primary" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? 'Gerando questoes...' : 'Gerar questoes'}
    </button>
  )
}

function subjectTopics(subject: Subject | undefined) {
  if (!subject || !Array.isArray(subject.syllabus)) return []

  return subject.syllabus
    .filter((topic): topic is string => typeof topic === 'string')
    .map((topic) => topic.replace(/\s+/g, ' ').trim())
    .filter(
      (topic) =>
        topic.length >= 4 &&
        !/^edital\b/i.test(topic) &&
        !/^n[o.]?\s*\d/i.test(topic) &&
        !/^cfsd$/i.test(topic),
    )
}

export function SimulationGenerator({
  projectId,
  projectBoard,
  subjects,
  recentQuestions,
}: {
  projectId: string
  projectBoard: string | null
  subjects: Subject[]
  recentQuestions: RecentQuestion[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [state, setState] = useState<SimulationState>({})
  const [pending, setPending] = useState(false)
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const topics = subjectTopics(subjects.find((subject) => subject.id === subjectId))
  const topicListId = `simulation-topics-${subjectId}`
  const boardProfile = getExamBoardProfile(projectBoard)
  const boardPromptContext = getExamBoardPromptContext(projectBoard)
  const expectedJson = getExamBoardJsonExample(projectBoard)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const selectedSubject = subjects.find(
      (subject) => subject.id === String(formData.get('subjectId')),
    )
    const selectedTopic = String(formData.get('topic') ?? '').trim()
    const quantity = Number(formData.get('quantity') ?? 5)

    if (!selectedSubject) {
      setState({ error: 'Materia invalida para este concurso.' })
      return
    }

    if (selectedTopic.length < 3) {
      setState({ error: 'Escolha ou informe o topico das questoes.' })
      return
    }

    setPending(true)
    setState({})

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data: { user } } = await supabase.auth.getUser()

      if (!session || !user) {
        setState({ error: 'Sessao expirada. Entre novamente.' })
        return
      }

      const repeatedContext = recentQuestions
        .filter((question) => question.subject_id === selectedSubject.id)
        .filter((question) => {
          if (!question.topic) return true
          return question.topic.toLowerCase() === selectedTopic.toLowerCase()
        })
        .slice(0, 12)
        .map((question, index) => `${index + 1}. ${question.statement}`)
        .join('\n')

      const result = await callIA([{
        role: 'user',
        content: `Gere ${quantity} questoes ineditas de concurso publico brasileiro.

MATERIA: ${selectedSubject.name}
TOPICO OBRIGATORIO: ${selectedTopic}

PERFIL DA BANCA:
${boardPromptContext}

Questoes ja usadas neste projeto para evitar repeticao:
${repeatedContext || 'Nenhuma questao anterior neste topico.'}

Regras:
- cobre somente o topico informado, sem questoes genericas da materia;
- nao repita enunciado, contexto, exemplo, caso pratico ou pegadinha das questoes ja usadas;
- respeite fielmente o formato da banca informado acima;
- varie dificuldade e forma de cobranca dentro do estilo da banca;
- explique por que a correta esta correta e por que a pegadinha pode confundir;
- se a questao usar palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque obrigatoriamente o termo com **dois asteriscos** no enunciado ou na alternativa. Exemplo: "A palavra **rapidamente** indica circunstancia de modo.";

Retorne somente JSON valido, sem Markdown, sem texto antes ou depois.
JSON esperado: ${expectedJson}`,
      }], {
        task: 'questao',
        maxTokens: quantity <= 5 ? 3000 : 4500,
        schema: questionsSchema,
        retries: 0,
        accessToken: session.access_token,
      })

      const normalizedPrevious = new Set(
        recentQuestions.map((question) =>
          question.statement.replace(/\s+/g, ' ').trim().toLowerCase(),
        ),
      )
      const uniqueQuestions = result.questions.filter((question) => {
        const statement = question.statement.replace(/\s+/g, ' ').trim().toLowerCase()
        return statement.length > 0 && !normalizedPrevious.has(statement)
      })
      const validQuestions = uniqueQuestions.filter((question) =>
        questionHasRequiredHighlight({
          statement: question.statement,
          alternatives: question.alternatives,
        }),
      )

      if (!validQuestions.length) {
        setState({
          error: uniqueQuestions.length
            ? 'A IA gerou questoes que dependiam de destaque, mas nao marcou o termo. Gere novamente.'
            : 'A IA gerou questoes parecidas com as anteriores. Tente outro topico ou gere novamente.',
        })
        return
      }

      const inserts: Database['public']['Tables']['mock_questions']['Insert'][] =
        validQuestions.map((question) => ({
          project_id: projectId,
          subject_id: selectedSubject.id,
          user_id: user.id,
          statement: question.statement,
          alternatives: question.alternatives,
          correct_answer: question.correctAnswer.toUpperCase(),
          explanation: question.explanation,
          difficulty: 'medio',
          topic: selectedTopic,
        }))

      const { error } = await supabase.from('mock_questions').insert(inserts)

      if (error) {
        setState({ error: error.message })
        return
      }

      setState({ success: `${validQuestions.length} questoes geradas.` })
      router.refresh()
    } catch (error) {
      setState({
        error: error instanceof Error ? error.message : 'Falha ao gerar questoes.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="dashboard-panel mb-5 grid gap-4 md:grid-cols-[1fr_120px_1.35fr_auto] md:items-end"
    >
      <input type="hidden" name="projectId" value={projectId} />

      <label>
        <span className="label">Materia</span>
        <select
          className="field"
          name="subjectId"
          value={subjectId}
          onChange={(event) => {
            setSubjectId(event.target.value)
            setTopic('')
          }}
          required
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className="label">Quantidade</span>
        <select className="field" name="quantity" defaultValue="5">
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="20">20</option>
        </select>
      </label>

      <label>
        <span className="label">Topico obrigatorio</span>
        <input
          className="field"
          name="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          list={topics.length ? topicListId : undefined}
          minLength={3}
          placeholder={
            topics.length
              ? 'Selecione ou escreva um topico especifico'
              : 'Ex: Direitos fundamentais'
          }
          required
        />
        {topics.length ? (
          <datalist id={topicListId}>
            {topics.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
        <span className="mt-1.5 block text-[11px] text-slate-500">
          {boardProfile
            ? `A banca ${boardProfile.name} define formato e estilo das questoes.`
            : 'As questoes serao focadas neste assunto para medir dominio real.'}
        </span>
      </label>

      <GenerateButton pending={pending} />

      <div className="md:col-span-4" aria-live="polite">
        {state?.error ? (
          <p className="text-sm text-atlas-red">{state.error}</p>
        ) : null}
        {state?.success ? (
          <p className="text-sm text-atlas-green">{state.success}</p>
        ) : null}
      </div>
    </form>
  )
}
