import { MaterialGenerator } from '@/app/(app)/materiais/generator'
import { MaterialCard } from '@/app/(app)/materiais/material-card'
import { SectionEmpty } from '@/components/section-empty'
import type { Material } from '@/lib/database.types'
import { requireWorkspace } from '@/lib/workspace'

export default async function MateriaisPage({
  searchParams,
}: {
  searchParams: { projeto?: string; tipo?: string }
}) {
  const { supabase, user, project, subjects } = await requireWorkspace(
    searchParams.projeto,
  )

  if (!project) {
    return (
      <SectionEmpty
        title="Sem concurso ativo"
        description="Adicione um edital antes de criar materiais."
      />
    )
  }

  const { data } = await supabase
    .from('materials')
    .select('*')
    .eq('project_id', project.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  const materials = (data ?? []) as Material[]

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-display text-xl font-extrabold">
          Materiais de Estudo
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Resumos e apostilas por matéria, prontos para estudar ou imprimir.
        </p>
      </header>

      {subjects.length ? (
        <MaterialGenerator projectId={project.id} subjects={subjects} />
      ) : null}

      {materials.length ? (
        <div className="space-y-3">
          {materials.map((material) => (
            <MaterialCard key={material.id} material={material} />
          ))}
        </div>
      ) : (
        <SectionEmpty
          title="Nenhum material ainda"
          description="Gere um resumo ou uma apostila para começar."
        />
      )}
    </div>
  )
}
