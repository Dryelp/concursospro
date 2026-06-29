'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Brain, Flame, LoaderCircle, Sparkles } from 'lucide-react'

import { generateFlashcardsAction, type FlashState } from '@/app/(app)/flashcards/actions'
import type { Subject } from '@/lib/database.types'
import type { FlashcardSuggestion } from '@/lib/flashcard-intelligence'

function subjectTopics(subject: Subject | undefined) {
  if (!subject || !Array.isArray(subject.syllabus)) return []

  return subject.syllabus
    .filter((topic): topic is string => typeof topic === 'string')
    .map((topic) => topic.replace(/\s+/g, ' ').trim())
    .filter((topic) => topic.length >= 4)
}

function Button() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary h-12 justify-center" disabled={pending}>
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Sparkles className="size-4" />
      )}
      {pending ? 'Criando cards...' : 'Gerar flashcards'}
    </button>
  )
}

export function FlashGenerator({
  projectId,
  subjects,
  suggestions,
}: {
  projectId: string
  subjects: Subject[]
  suggestions: FlashcardSuggestion[]
}) {
  const [state, action] = useFormState<FlashState, FormData>(generateFlashcardsAction, {})
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const selectedSubject = subjects.find((subject) => subject.id === subjectId)
  const topics = subjectTopics(selectedSubject)
  const topicListId = `flashcard-topics-${subjectId}`
  const filteredSuggestions = suggestions.filter((suggestion) => suggestion.subjectId === subjectId)
  const visibleSuggestions = filteredSuggestions.length
    ? filteredSuggestions
    : suggestions.slice(0, 4)

  return (
    <form action={action} className="dashboard-panel overflow-hidden p-0">
      <div className="border-b border-white/10 bg-gradient-to-r from-atlas-400/10 via-atlas-violet/10 to-transparent p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="dashboard-eyebrow">Gerador guiado</p>
            <h3 className="mt-1 font-display text-lg font-extrabold text-white">
              Crie cards pelo ponto fraco certo
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Bons flashcards cobrem um conceito por vez. Escolha um topico especifico para a IA
              criar perguntas curtas e memoraveis.
            </p>
          </div>
          <span className="dashboard-chip">
            <Brain className="size-3.5" />
            topico obrigatorio
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-[1fr_120px_1.35fr_auto] md:items-end">
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
          <select className="field" name="quantity" defaultValue="10">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
          </select>
        </label>

        <label>
          <span className="label">Topico recomendado</span>
          <input
            className="field"
            name="topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            list={topics.length ? topicListId : undefined}
            minLength={3}
            placeholder={topics.length ? 'Selecione ou escreva um topico' : 'Ex: Concordancia verbal'}
            required
          />
          {topics.length ? (
            <datalist id={topicListId}>
              {topics.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          ) : null}
        </label>

        <Button />

        <div className="md:col-span-4">
          <div className="flex flex-wrap gap-2">
            {visibleSuggestions.map((suggestion) => (
              <button
                key={`${suggestion.subjectId}-${suggestion.topic}`}
                type="button"
                className="group rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-left text-xs font-semibold text-slate-400 transition hover:border-atlas-400/50 hover:bg-atlas-400/10 hover:text-slate-100"
                onClick={() => {
                  setSubjectId(suggestion.subjectId)
                  setTopic(suggestion.topic)
                }}
              >
                <span className="mr-1 inline-flex items-center gap-1 text-atlas-400">
                  <Flame className="inline size-3" />
                  {suggestion.subjectName}
                </span>
                {suggestion.topic}
                <span className="ml-2 text-slate-600 group-hover:text-slate-400">
                  {suggestion.reason}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-4" aria-live="polite">
          {state?.error ? <p className="text-sm text-atlas-red">{state.error}</p> : null}
          {state?.success ? <p className="text-sm text-atlas-green">{state.success}</p> : null}
        </div>
      </div>
    </form>
  )
}
