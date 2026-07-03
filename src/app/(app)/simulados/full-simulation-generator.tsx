'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { FileQuestion, LoaderCircle, ShieldCheck } from 'lucide-react'

import {
  generateFullSimulationAction,
  type FullSimulationState,
} from '@/app/(app)/simulados/actions'
import {
  formatExamStructureLabel,
  type ExamStructure,
} from '@/lib/exam-structure'

const initialState: FullSimulationState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary w-full justify-center sm:w-auto" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <FileQuestion className="size-4" />}
      {pending ? 'Montando simulado...' : 'Gerar simulado completo'}
    </button>
  )
}

export function FullSimulationGenerator({
  projectId,
  examStructure,
}: {
  projectId: string
  examStructure: ExamStructure
}) {
  const [state, action] = useFormState(generateFullSimulationAction, initialState)
  const previewDisciplines = examStructure.disciplines.slice(0, 5)
  const remaining = Math.max(0, examStructure.disciplines.length - previewDisciplines.length)

  return (
    <section className="dashboard-panel border-atlas-400/20 bg-gradient-to-br from-atlas-400/[0.12] via-ink-900 to-ink-950">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="dashboard-eyebrow">Prova real</p>
          <h3 className="mt-1 font-display text-xl font-extrabold text-white">
            Simulado completo
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Gere uma bateria proporcional à estrutura do edital, respeitando banca,
            formato e distribuição por matéria.
          </p>
        </div>
        <span className="dashboard-chip w-fit">
          <ShieldCheck className="size-3.5" />
          {examStructure.source === 'edital' ? 'Detectado no edital' : 'Estimado'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Matriz
          </p>
          <strong className="mt-2 block text-sm text-white">
            {formatExamStructureLabel(examStructure)}
          </strong>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Confiança
          </p>
          <strong className="mt-2 block text-sm text-white">
            {Math.round(examStructure.confidence * 100)}%
          </strong>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Tempo
          </p>
          <strong className="mt-2 block text-sm text-white">
            {examStructure.durationMinutes ? `${examStructure.durationMinutes} min` : 'A confirmar'}
          </strong>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-ink-950/45 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Distribuição
        </p>
        <div className="space-y-2">
          {previewDisciplines.map((discipline) => (
            <div
              key={discipline.name}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate font-semibold text-slate-200">
                {discipline.name}
              </span>
              <span className="shrink-0 text-xs font-bold text-atlas-400">
                {discipline.questionCount ?? '?'} questões
              </span>
            </div>
          ))}
          {remaining ? (
            <p className="pt-1 text-xs text-slate-500">
              + {remaining} matérias na matriz.
            </p>
          ) : null}
        </div>
      </div>

      {examStructure.warnings.length ? (
        <p className="mt-4 rounded-2xl border border-atlas-yellow/15 bg-atlas-yellow/10 px-4 py-3 text-xs leading-5 text-atlas-yellow">
          {examStructure.warnings[0]}
        </p>
      ) : null}

      <form action={action} className="mt-5">
        <input type="hidden" name="projectId" value={projectId} />
        <SubmitButton />
        <div className="mt-3" aria-live="polite">
          {state.error ? <p className="text-sm text-atlas-red">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-atlas-green">{state.success}</p> : null}
        </div>
      </form>
    </section>
  )
}
