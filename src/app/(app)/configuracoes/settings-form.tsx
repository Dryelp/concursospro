'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { LoaderCircle, Save } from 'lucide-react'

import {
  saveSettingsAction,
  type SettingsState,
} from '@/app/(app)/configuracoes/actions'

const weekDays = [
  ['Seg', 1],
  ['Ter', 2],
  ['Qua', 3],
  ['Qui', 4],
  ['Sex', 5],
  ['Sab', 6],
  ['Dom', 7],
] as const

function inferDisplayDailyHours(value: number, studyDays: number[]) {
  const safeValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 2
  const safeDays = Math.max(1, studyDays.length)
  return safeValue > 8 ? Math.max(1, Math.min(12, Math.round(safeValue / safeDays))) : safeValue
}

function Button() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
      Salvar preferencias
    </button>
  )
}

export function SettingsForm({
  profile,
  projectId,
}: {
  profile: {
    nome: string | null
    hours_per_week: number
    study_days: number[]
    study_goal: string | null
  } | null
  projectId?: string
}) {
  const [state, action] = useFormState<SettingsState, FormData>(
    saveSettingsAction,
    {},
  )
  const selectedDays = profile?.study_days ?? [1, 2, 3, 4, 5]
  const dailyHours = inferDisplayDailyHours(profile?.hours_per_week ?? 2, selectedDays)

  return (
    <form action={action} className="panel p-5">
      <input type="hidden" name="projectId" value={projectId ?? ''} />
      <h2 className="mb-5 font-display text-base font-bold">Preferencias de estudo</h2>

      <label className="mb-4 block">
        <span className="label">Nome de exibicao</span>
        <input className="field" name="nome" defaultValue={profile?.nome ?? ''} required />
      </label>

      <label className="mb-4 block">
        <span className="label">Horas por dia</span>
        <input
          className="field"
          type="number"
          min="1"
          max="12"
          name="hours"
          defaultValue={dailyHours}
        />
        <span className="mt-2 block text-xs text-slate-500">
          O cronograma vai distribuir essa carga nos dias marcados abaixo.
        </span>
      </label>

      <fieldset className="mb-4">
        <legend className="label">Dias de estudo</legend>
        <div className="flex flex-wrap gap-2">
          {weekDays.map(([label, value]) => (
            <label key={value} className="cursor-pointer">
              <input
                className="peer sr-only"
                type="checkbox"
                name="days"
                value={value}
                defaultChecked={selectedDays.includes(value)}
              />
              <span className="block rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-slate-500 peer-checked:border-atlas-400 peer-checked:bg-atlas-400 peer-checked:text-white">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mb-5 block">
        <span className="label">Foco principal</span>
        <input
          className="field"
          name="goal"
          defaultValue={profile?.study_goal ?? ''}
          placeholder="Ex: Direito Constitucional"
        />
      </label>

      <Button />

      <div className="mt-3" aria-live="polite">
        {state?.error ? <p className="text-sm text-atlas-red">{state.error}</p> : null}
        {state?.success ? <p className="text-sm text-atlas-green">{state.success}</p> : null}
      </div>
    </form>
  )
}
