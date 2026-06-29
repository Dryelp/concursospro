import { SettingsForm } from '@/app/(app)/configuracoes/settings-form'
import { requireWorkspace } from '@/lib/workspace'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project } = await requireWorkspace(searchParams.projeto)
  const { data } = await supabase
    .from('profiles')
    .select('nome,hours_per_week,study_days,study_goal')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-display text-xl font-extrabold">Configurações</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ajuste a intensidade e o foco do seu plano.
        </p>
      </header>

      <div className="max-w-3xl">
        <SettingsForm profile={data} projectId={project?.id} />
      </div>
    </div>
  )
}
