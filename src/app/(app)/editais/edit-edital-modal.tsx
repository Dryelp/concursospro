'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { LoaderCircle, Pencil, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  updateEditalAction,
  type UpdateEditalState,
} from '@/app/(app)/editais/actions'
import type { ExamProject } from '@/lib/database.types'

const initialState: UpdateEditalState = {}

function SaveButton() {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary w-full" disabled={pending}>
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Pencil className="size-4" />}
      {pending ? 'Salvando...' : 'Salvar alterações'}
    </button>
  )
}

export function EditEditalModal({ project }: { project: ExamProject }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction] = useFormState(updateEditalAction, initialState)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!state.success) return
    setOpen(false)
    router.refresh()
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }, [router, state.success])

  useEffect(() => {
    if (!open) return
    titleRef.current?.focus()

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled])',
        )]
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function closeModal() {
    setOpen(false)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="rounded-lg p-2 text-slate-500 transition hover:bg-atlas-400/10 hover:text-atlas-400"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Editar ${project.title}`}
      >
        <Pencil className="size-4" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`editar-edital-${project.id}`}
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[24px] border border-white/[0.12] bg-ink-900 p-6 shadow-panel"
          >
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-atlas-400">
                  Edital ativo
                </p>
                <h2 id={`editar-edital-${project.id}`} className="mt-1 font-display text-lg font-bold">
                  Editar concurso
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-ink-850 hover:text-slate-200"
                aria-label="Fechar"
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div aria-live="polite">
              {state.error ? (
                <p className="mb-4 rounded-lg border-l-2 border-atlas-red bg-atlas-red/10 px-4 py-3 text-sm text-atlas-red">
                  {state.error}
                </p>
              ) : null}
            </div>

            <form action={formAction}>
              <input type="hidden" name="id" value={project.id} />

              <label className="mb-4 block">
                <span className="label">Nome do concurso</span>
                <input
                  ref={titleRef}
                  className="field"
                  name="titulo"
                  defaultValue={project.title}
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Órgão</span>
                  <input
                    className="field"
                    name="orgao"
                    defaultValue={project.organization ?? ''}
                    placeholder="Ex: PMMG"
                  />
                </label>
                <label className="block">
                  <span className="label">Banca</span>
                  <input
                    className="field"
                    name="banca"
                    defaultValue={project.board ?? ''}
                    placeholder="Ex: Cebraspe, FGV, IBFC"
                  />
                </label>
              </div>

              <div className="my-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Cargo</span>
                  <input
                    className="field"
                    name="cargo"
                    defaultValue={project.position_name ?? ''}
                    placeholder="Ex: Soldado"
                  />
                </label>
                <label className="block">
                  <span className="label">Data da prova</span>
                  <input
                    className="field [color-scheme:dark]"
                    name="data_prova"
                    type="date"
                    defaultValue={project.exam_date ?? ''}
                  />
                </label>
              </div>

              <p className="mb-5 rounded-2xl border border-atlas-400/15 bg-atlas-400/[0.06] px-4 py-3 text-xs leading-5 text-slate-400">
                Alterar a banca muda o estilo das próximas questões geradas nos simulados. As questões antigas continuam salvas como estavam.
              </p>

              <SaveButton />
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
