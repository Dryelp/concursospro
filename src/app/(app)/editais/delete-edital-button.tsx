'use client'

import { Trash2 } from 'lucide-react'

import { deleteEditalAction } from '@/app/(app)/editais/actions'

export function DeleteEditalButton({ id, title }: { id: string; title: string }) {
  return (
    <form
      action={deleteEditalAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Excluir "${title}"? O cronograma, as revisões e os materiais também serão apagados.`,
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        className="rounded-lg p-2 text-slate-600 transition hover:bg-atlas-red/10 hover:text-atlas-red"
        aria-label={`Excluir ${title}`}
      >
        <Trash2 className="size-4" />
      </button>
    </form>
  )
}
