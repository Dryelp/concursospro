'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Filter, LoaderCircle, Search, Sparkles } from 'lucide-react'

import {
  getExamBoardJsonExample,
  getExamBoardProfile,
  getExamBoardPromptContext,
} from '@/lib/bancas'
import type { Database } from '@/lib/database.types'
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

export type SimulationSubjectOption = {
  id: string
  name: string
  syllabus: string[]
  isVirtual?: boolean
  questionCount?: number | null
}

function GenerateButton({ pending }: { pending: boolean }) {
  return (
    <button className="button-primary w-full justify-center xl:w-auto" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? 'Gerando questões...' : 'Gerar questões'}
    </button>
  )
}

function subjectTopics(subject: SimulationSubjectOption | undefined) {
  if (!subject || !Array.isArray(subject.syllabus)) return []

  return subject.syllabus
    .map((topic) => topic.replace(/\s+/g, ' ').trim())
    .filter(
      (topic) =>
        topic.length >= 4 &&
        !/^\d+(?:[,.]\d+)?\s*(?:pontos?|quest(?:ao|oes|ões))$/i.test(topic) &&
        !/^(?:pontos?|pontuacao|pontuação|valor|nota)\b/i.test(topic) &&
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
  subjects: SimulationSubjectOption[]
  recentQuestions: RecentQuestion[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [state, setState] = useState<SimulationState>({})
  const [pending, setPending] = useState(false)
  const [subjectQuery, setSubjectQuery] = useState('')
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const selectedSubjectOption = subjects.find((subject) => subject.id === subjectId)
  const topics = subjectTopics(selectedSubjectOption)
  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(subjectQuery.trim().toLowerCase()),
  )
  const topicListId = `simulation-topics-${subjectId}`
  const boardProfile = getExamBoardProfile(projectBoard)
  const boardPromptContext = getExamBoardPromptContext(projectBoard)
  const expectedJson = getExamBoardJsonExample(projectBoard)

  async function ensurePersistedSubject(
    subject: SimulationSubjectOption,
    userId: string,
  ): Promise<SimulationSubjectOption | null> {
    if (!subject.isVirtual) return subject

    const syllabus = subject.syllabus.length ? subject.syllabus : [subject.name]
    const { data, error } = await supabase
      .from('subjects')
      .insert({
        project_id: projectId,
        user_id: userId,
        name: subject.name,
        priority: 3,
        origin: 'extracted',
        source_pages: [],
        confidence: 0.65,
        topic_count: syllabus.length,
        mastery: 0,
        syllabus,
      })
      .select('id, name, syllabus')
      .single()

    if (error || !data) {
      setState({ error: error?.message ?? 'Falha ao salvar disciplina detectada na matriz.' })
      return null
    }

    return {
      id: data.id,
      name: data.name,
      syllabus: Array.isArray(data.syllabus)
        ? data.syllabus.filter((item): item is string => typeof item === 'string')
        : syllabus,
    }
  }

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

      const persistedSubject = await ensurePersistedSubject(selectedSubject, user.id)
      if (!persistedSubject) return

      const repeatedContext = recentQuestions
        .filter((question) => question.subject_id === persistedSubject.id)
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

MATERIA: ${persistedSubject.name}
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
- todas as questoes devem ter correctAnswer e explanation preenchidos; nunca deixe esses campos vazios ou ausentes;
- se a questao usar palavra destacada, grifada, sublinhada, em destaque ou em negrito, marque obrigatoriamente o termo com **dois asteriscos** no enunciado ou na alternativa. Exemplo: "A palavra **rapidamente** indica circunstancia de modo.";

Retorne somente JSON valido, sem Markdown, sem texto antes ou depois.
JSON esperado: ${expectedJson}`,
      }], {
        task: 'questao',
        maxTokens: quantity <= 5 ? 3000 : 4500,
        schema: questionsSchema,
        retries: 0,
        accessToken: session.access_token,
        timeoutMs: 60_000,
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
          subject_id: persistedSubject.id,
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
      className="dashboard-panel mb-5 space-y-5 overflow-hidden"
    >
      <input type="hidden" name="projectId" value={projectId} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="dashboard-eyebrow">Banco de questões</p>
          <h3 className="mt-1 font-display text-xl font-extrabold text-white">
            Gerar por filtro
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Selecione a disciplina e o assunto do edital antes de gerar a bateria.
            A IA fica presa nesses filtros para não misturar conteúdo.
          </p>
        </div>
        <span className="dashboard-chip w-fit">
          <Filter className="size-3.5" />
          {boardProfile ? boardProfile.name : 'Banca do edital'}
        </span>
      </div>

      <input type="hidden" name="subjectId" value={subjectId} />

      <div className="rounded-3xl border border-white/10 bg-ink-950/45 p-3">
        <div className="grid gap-3 2xl:grid-cols-[minmax(240px,0.95fr)_minmax(260px,1.15fr)_150px] 2xl:items-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="label mb-0">Disciplina</span>
              <span className="text-[11px] text-slate-600">
                {subjects.length} disponíveis
              </span>
            </div>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                className="field h-11 pl-10 text-sm"
                value={subjectQuery}
                onChange={(event) => setSubjectQuery(event.target.value)}
                placeholder="Buscar disciplina"
              />
            </div>
            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
              {filteredSubjects.map((subject) => (
                <button
                  key={subject.id}
                  type="button"
                  className={`rounded-2xl border px-3 py-2 text-left transition ${
                    subject.id === subjectId
                      ? 'border-atlas-400 bg-atlas-400/15 text-white'
                      : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-atlas-400/40 hover:text-white'
                  }`}
                  onClick={() => {
                    setSubjectId(subject.id)
                    setTopic('')
                  }}
                >
                  <span className="block truncate text-sm font-bold">{subject.name}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {subject.isVirtual
                      ? 'Detectada na matriz da prova'
                      : `${subject.syllabus.length || 1} tópicos do edital`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="label mb-0">Assunto</span>
              <span className="text-[11px] text-slate-600">{topics.length} tópicos</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <input
                className="field pl-11"
                name="topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                list={topics.length ? topicListId : undefined}
                minLength={3}
                placeholder={
                  topics.length
                    ? 'Busque ou selecione um assunto'
                    : 'Ex: Direitos fundamentais'
                }
                required
              />
            </div>
            {topics.length ? (
              <datalist id={topicListId}>
                {topics.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            ) : null}
            {topics.length ? (
              <div className="mt-3 grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {topics.slice(0, 18).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-2xl border px-3 py-2 text-left text-xs font-semibold leading-5 transition ${
                      topic === item
                        ? 'border-atlas-400 bg-atlas-400 text-white'
                        : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-atlas-400/40 hover:text-white'
                    }`}
                    onClick={() => setTopic(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-2xl border border-atlas-yellow/15 bg-atlas-yellow/10 px-3 py-2 text-xs leading-5 text-atlas-yellow">
                Nenhum tópico confiável foi extraído para esta disciplina. Digite um assunto específico ou reenvie o edital para a IA reler.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <label>
              <span className="label">Quantidade</span>
              <select className="field" name="quantity" defaultValue="5">
                <option value="5">5 questões</option>
                <option value="10">10 questões</option>
                <option value="20">20 questões</option>
              </select>
            </label>
            <div className="mt-3">
              <GenerateButton pending={pending} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              {selectedSubjectOption?.questionCount
                ? `${selectedSubjectOption.questionCount} questões previstas na prova para esta disciplina.`
                : 'Use uma quantidade curta para estudar por ciclos.'}
            </p>
          </div>
        </div>
      </div>

      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-slate-500">
        {boardProfile
          ? `A banca ${boardProfile.name} orienta formato, estilo e nível das questões.`
          : 'As questões serão focadas neste assunto para medir domínio real.'}
      </p>

      <div aria-live="polite">
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
