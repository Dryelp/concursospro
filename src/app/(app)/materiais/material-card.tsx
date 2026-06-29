'use client'

import { useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { ChevronDown, FileDown, FileText, Trash2 } from 'lucide-react'

import { deleteMaterialAction } from '@/app/(app)/materiais/actions'
import type { Material } from '@/lib/database.types'

export function MaterialCard({ material }: { material: Material }) {
  const [open, setOpen] = useState(false)
  const bodyId = `material-${material.id}`

  return (
    <article className="panel overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold">{material.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(material.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <ChevronDown
            className={`ml-auto size-4 text-slate-500 transition ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        <Link
          href={`/materiais/${material.id}/imprimir?projeto=${material.project_id}`}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-atlas-400/10 hover:text-atlas-400"
          aria-label={`Preparar PDF de ${material.title}`}
          title="Preparar PDF"
        >
          <FileDown className="size-4" />
        </Link>

        <form action={deleteMaterialAction}>
          <input type="hidden" name="id" value={material.id} />
          <button
            className="rounded-lg p-2 text-slate-600 transition hover:bg-atlas-red/10 hover:text-atlas-red"
            aria-label="Excluir material"
          >
            <Trash2 className="size-4" />
          </button>
        </form>
      </div>

      {open ? (
        <div
          id={bodyId}
          className="prose prose-invert max-w-none border-t border-white/[0.07] px-5 py-6 text-sm leading-7 text-slate-300"
        >
          <ReactMarkdown>{material.content_md ?? ''}</ReactMarkdown>
        </div>
      ) : null}
    </article>
  )
}
