'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  createEditalAction,
  type CreateEditalState,
} from '@/app/(app)/editais/actions'

const initialState: CreateEditalState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <div>
      {pending ? (
        <div className="mb-4 rounded-xl border border-atlas-400/20 bg-atlas-400/[0.06] p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-atlas-400">
              Criando edital e extraindo matérias...
            </span>
            <LoaderCircle className="size-4 animate-spin text-atlas-400" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-850">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-atlas-400 to-atlas-violet" />
          </div>
        </div>
      ) : null}
      <button className="button-primary w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {pending ? 'Processando...' : 'Criar edital'}
      </button>
    </div>
  )
}

export function NewEditalModal({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(initiallyOpen)
  const [state, formAction] = useFormState(createEditalAction, initialState)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (initiallyOpen) setOpen(true)
  }, [initiallyOpen])

  useEffect(() => {
    if (!state?.projectId) return
    setOpen(false)
    router.push(
      `/editais?projeto=${state.projectId}&criado=${state.subjectCount ?? 0}`,
    )
    router.refresh()
  }, [router, state?.projectId, state?.subjectCount])

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
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
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
      <button ref={triggerRef} className="button-primary" onClick={() => setOpen(true)}>
        <span className="text-lg leading-none">+</span>
        Novo edital
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-edital-title"
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-[24px] border border-white/[0.12] bg-ink-900 p-6 shadow-panel"
          >
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-atlas-400">
                  Novo projeto
                </p>
                <h2 id="novo-edital-title" className="mt-1 font-display text-lg font-bold">
                  Adicionar edital
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-ink-850 hover:text-slate-200"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </header>

            <div aria-live="polite">
            {state?.error ? (
              <p className="mb-4 rounded-lg border-l-2 border-atlas-red bg-atlas-red/10 px-4 py-3 text-sm text-atlas-red">
                {state.error}
              </p>
            ) : null}
            </div>

            <form action={formAction}>
              <label className="mb-4 block">
                <span className="label">Nome do concurso</span>
                <input
                  ref={titleRef}
                  className="field"
                  name="titulo"
                  placeholder="Ex: Bombeiro Militar MG 2026"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Órgão / Banca</span>
                  <input className="field" name="orgao" placeholder="Ex: IDECAN" />
                </label>
                <label className="block">
                  <span className="label">Data da prova</span>
                  <input className="field [color-scheme:dark]" name="data_prova" type="date" />
                </label>
              </div>

              <label className="my-4 block">
                <span className="label">Cargo</span>
                <input className="field" name="cargo" placeholder="Ex: Soldado BM" />
              </label>

              <label className="mb-5 block">
                <span className="label">Cole o conteúdo programático aqui</span>
                <textarea
                  className="field min-h-[210px] resize-y leading-6"
                  name="conteudo"
                  required
                  placeholder={'LÍNGUA PORTUGUESA: Interpretação de texto. Ortografia...\n\nMATEMÁTICA: Conjuntos. Funções. Equações...'}
                />
              </label>

              <SubmitButton />
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
