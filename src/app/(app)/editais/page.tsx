import Link from 'next/link'
import { CalendarDays, Target } from 'lucide-react'

import { DeleteEditalButton } from '@/app/(app)/editais/delete-edital-button'
import { EditEditalModal } from '@/app/(app)/editais/edit-edital-modal'
import { NewEditalModal } from '@/app/(app)/editais/new-edital-modal'
import { EmptyState } from '@/components/empty-state'
import { daysUntil } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'

export default async function EditaisPage({
  searchParams,
}: {
  searchParams: { projeto?: string; novo?: string; criado?: string }
}) {
  const { projects } = await requireWorkspace(searchParams.projeto)
  const selectedProjectId = searchParams.projeto ?? projects[0]?.id

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold">Meus Editais</h2>
          <p className="mt-1 text-sm text-slate-500">
            Seus concursos e conteúdos programáticos.
          </p>
        </div>
        <NewEditalModal initiallyOpen={searchParams.novo === '1'} />
      </header>

      {searchParams.criado !== undefined ? (
        <div className="mb-4 rounded-xl border border-atlas-green/20 bg-atlas-green/[0.07] px-4 py-3 text-sm text-atlas-green">
          Edital criado com {searchParams.criado} matérias identificadas.
        </div>
      ) : null}

      {!projects.length ? (
        <section className="panel">
          <EmptyState
            icon={Target}
            title="Nenhum edital"
            description='Clique em "+ Novo edital" para começar.'
          />
        </section>
      ) : (
        <section className="space-y-2">
          {projects.map((project) => {
            const days = daysUntil(project.exam_date)
            const selected = project.id === selectedProjectId

            return (
              <article
                key={project.id}
                className={`flex items-center gap-3 rounded-[18px] border bg-ink-900 p-4 transition ${selected
                  ? 'border-atlas-400 bg-atlas-400/[0.07]'
                  : 'border-white/[0.07] hover:border-atlas-400/70'
                }`}
              >
                <Link
                  href={`/editais?projeto=${project.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400">
                    <Target className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{project.title}</h3>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                      {project.position_name ? <span>{project.position_name} ·</span> : null}
                      {project.board ? <span>{project.board} ·</span> : null}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {days === null
                          ? 'Sem data'
                          : days >= 0
                            ? `${days} dias para a prova`
                            : 'Prova encerrada'}
                      </span>
                    </p>
                  </div>
                </Link>
                {selected ? (
                  <span className="hidden rounded-full border border-atlas-green/25 bg-atlas-green/10 px-2.5 py-1 text-[10px] font-bold text-atlas-green sm:inline">
                    Ativo
                  </span>
                ) : null}
                <EditEditalModal project={project} />
                <DeleteEditalButton id={project.id} title={project.title} />
              </article>
            )
          })}
        </section>
      )}
    </div>
  )
}
