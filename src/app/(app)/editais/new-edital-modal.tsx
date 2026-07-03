'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { FileUp, LoaderCircle, Sparkles, TextCursorInput, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

import {
  createEditalAction,
  type CreateEditalState,
} from '@/app/(app)/editais/actions'
import { ingestEditalFile } from '@/features/edital-upload/lib/ingest-edital-file'
import { invokeIaExtraction } from '@/lib/ai/invoke-ia-function'
import { persistIngestedEdital, type StudyPlanConfig } from '@/lib/concurseiro-data'
import { createClient } from '@/lib/supabase/client'

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
  const [mode, setMode] = useState<'upload' | 'manual'>('upload')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [state, formAction] = useFormState(createEditalAction, initialState)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
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
    setUploadError(null)
    setUploadNotice(null)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploadError(null)
    setUploadNotice(null)

    const formData = new FormData(event.currentTarget)
    const file = formData.get('editalFile')
    if (!(file instanceof File) || file.size === 0) {
      setUploadError('Selecione o PDF, imagem ou texto do edital.')
      return
    }

    setUploading(true)
    setUploadNotice('Lendo o arquivo e enviando para a IA...')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUploadError('Sua sessão expirou. Entre novamente antes de enviar o edital.')
        return
      }

      const result = await ingestEditalFile({
        file,
        remoteExtraction: (request) => invokeIaExtraction(supabase, request),
      })
      const config: StudyPlanConfig = {
        projectTitle: String(formData.get('titulo') ?? '').trim(),
        weeklyHours: Number(formData.get('horas_dia') ?? 2) || 2,
        studyDays: [1, 2, 3, 4, 5],
        focusSubject: String(formData.get('foco') ?? '').trim(),
      }
      const persisted = await persistIngestedEdital({
        supabase,
        user,
        file,
        result,
        config,
      })

      setUploadNotice('Edital lido. Concurso, matérias e matriz inicial foram criados.')
      setOpen(false)
      router.push(`/editais?projeto=${persisted.project.id}&criado=upload`)
      router.refresh()
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível ler e salvar o edital.',
      )
    } finally {
      setUploading(false)
    }
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
            className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-[24px] border border-white/[0.12] bg-ink-900 p-6 shadow-panel"
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
                type="button"
              >
                <X className="size-4" />
              </button>
            </header>

            <div aria-live="polite">
              {uploadError ? (
                <p className="mb-4 rounded-lg border-l-2 border-atlas-red bg-atlas-red/10 px-4 py-3 text-sm text-atlas-red">
                  {uploadError}
                </p>
              ) : null}
              {uploadNotice ? (
                <p className="mb-4 rounded-lg border-l-2 border-atlas-400 bg-atlas-400/10 px-4 py-3 text-sm text-atlas-400">
                  {uploadNotice}
                </p>
              ) : null}
              {state?.error && mode === 'manual' ? (
                <p className="mb-4 rounded-lg border-l-2 border-atlas-red bg-atlas-red/10 px-4 py-3 text-sm text-atlas-red">
                  {state.error}
                </p>
              ) : null}
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-ink-950/50 p-1.5">
              <button
                type="button"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  mode === 'upload'
                    ? 'bg-atlas-400 text-white shadow-glow'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => setMode('upload')}
              >
                <FileUp className="size-4" />
                Upload com IA
              </button>
              <button
                type="button"
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
                  mode === 'manual'
                    ? 'bg-atlas-400 text-white shadow-glow'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
                onClick={() => setMode('manual')}
              >
                <TextCursorInput className="size-4" />
                Colar conteúdo
              </button>
            </div>

            {mode === 'upload' ? (
              <form onSubmit={handleUpload}>
                <label className="mb-4 block">
                  <span className="label">Arquivo do edital</span>
                  <input
                    ref={fileRef}
                    className="field file:mr-4 file:rounded-xl file:border-0 file:bg-atlas-400 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                    name="editalFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.html,image/*,application/pdf,text/plain"
                    required
                  />
                  <span className="mt-2 block text-xs leading-5 text-slate-500">
                    PDF textual é o melhor cenário. Imagens e PDFs escaneados vão para leitura visual/OCR pela IA quando possível.
                  </span>
                </label>

                <label className="mb-4 block">
                  <span className="label">Nome do concurso opcional</span>
                  <input
                    className="field"
                    name="titulo"
                    placeholder="Deixe vazio para a IA identificar pelo edital"
                  />
                </label>

                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Horas por dia</span>
                    <input
                      className="field"
                      name="horas_dia"
                      type="number"
                      min="1"
                      max="12"
                      defaultValue="2"
                    />
                  </label>
                  <label className="block">
                    <span className="label">Foco/cargo opcional</span>
                    <input className="field" name="foco" placeholder="Ex: Soldado" />
                  </label>
                </div>

                <div className="mb-5 rounded-2xl border border-atlas-400/15 bg-atlas-400/[0.06] px-4 py-3 text-xs leading-5 text-slate-400">
                  A IA vai extrair banca, cargo, data, matérias, tópicos e estrutura da prova. Depois você pode revisar o edital criado.
                </div>

                {uploading ? (
                  <div className="mb-4 rounded-xl border border-atlas-400/20 bg-atlas-400/[0.06] p-3">
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-atlas-400">
                        Lendo edital, extraindo matriz e salvando projeto...
                      </span>
                      <LoaderCircle className="size-4 animate-spin text-atlas-400" />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-850">
                      <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-atlas-400 to-atlas-violet" />
                    </div>
                  </div>
                ) : null}

                <button className="button-primary w-full" disabled={uploading}>
                  {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {uploading ? 'Processando edital...' : 'Ler edital com IA'}
                </button>
              </form>
            ) : (
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

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="label">Órgão</span>
                  <input className="field" name="orgao" placeholder="Ex: PMMG" />
                </label>
                <label className="block">
                  <span className="label">Banca</span>
                  <input className="field" name="banca" placeholder="Ex: IDECAN" />
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
            )}
          </section>
        </div>
      ) : null}
    </>
  )
}
