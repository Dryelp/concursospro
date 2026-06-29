'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { LoaderCircle, Sparkles } from 'lucide-react'

import {
  generateMaterialAction,
  type MaterialState,
} from '@/app/(app)/materiais/actions'
import type { Subject } from '@/lib/database.types'

function GenerateButton() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? 'Gerando conteúdo aprofundado...' : 'Gerar material'}
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
        !/^n[º°o.]?\s*\d/i.test(topic) &&
        !/^cfsd$/i.test(topic),
    )
}

export function MaterialGenerator({
  projectId,
  subjects,
}: {
  projectId: string
  subjects: Subject[]
}) {
  const [state, action] = useFormState<MaterialState, FormData>(
    generateMaterialAction,
    {},
  )
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const topics = subjectTopics(
    subjects.find((subject) => subject.id === subjectId),
  )
  const topicListId = `material-topics-${subjectId}`

  return (
    <form
      action={action}
      className="panel mb-5 grid gap-4 p-5 md:grid-cols-[1fr_170px_1.3fr_auto] md:items-end"
    >
      <input type="hidden" name="projectId" value={projectId} />

      <label>
        <span className="label">Matéria</span>
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
        <span className="label">Formato</span>
        <select className="field" name="kind" defaultValue="resumo">
          <option value="resumo">Resumo aprofundado</option>
          <option value="apostila">Apostila completa</option>
        </select>
      </label>

      <label>
        <span className="label">Tópico obrigatório</span>
        <input
          className="field"
          name="topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          list={topics.length ? topicListId : undefined}
          placeholder={
            topics.length
              ? 'Selecione ou escreva um tópico específico'
              : 'Ex: Concordância verbal e nominal'
          }
          minLength={3}
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
          O material será limitado a este assunto, sem resumo genérico da matéria.
        </span>
      </label>

      <GenerateButton />

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
