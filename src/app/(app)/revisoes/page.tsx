import { RefreshCcw } from 'lucide-react'

import { rateReviewAction } from '@/app/(app)/revisoes/actions'
import { SectionEmpty } from '@/components/section-empty'
import type { ReviewItem } from '@/lib/database.types'
import { todayIso } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'

const ratings = [['Difícil',1],['Regular',2],['Ok',3],['Bom',4],['Ótimo',5]] as const

export default async function RevisoesPage({ searchParams }: { searchParams: { projeto?: string } }) {
  const { supabase, user, project } = await requireWorkspace(searchParams.projeto)
  if (!project) return <SectionEmpty title="Sem concurso ativo" description="Adicione um edital antes de iniciar revisões." />
  const { data } = await supabase.from('review_items').select('*').eq('project_id', project.id).eq('user_id', user.id).eq('status', 'active').lte('next_review_at', todayIso()).order('next_review_at')
  const reviews = (data ?? []) as ReviewItem[]
  return <div><header className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-xl font-extrabold">Revisões Anki</h2><p className="mt-1 text-sm text-slate-500">Fila baseada em repetição espaçada SM-2.</p></div><span className="rounded-full border border-atlas-400/25 bg-atlas-400/10 px-3 py-1.5 text-xs font-bold text-atlas-400">{reviews.length} pendentes</span></header>
    {!reviews.length ? <SectionEmpty title="Tudo em dia" description="Nenhuma revisão pendente. Continue executando o cronograma." /> : <div className="space-y-3">{reviews.map((review) => <article key={review.id} className="panel p-5"><div className="flex gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-atlas-400/10 text-atlas-400"><RefreshCcw className="size-4" /></div><div><h3 className="font-semibold">{review.title}</h3><p className="mt-1 text-xs text-slate-500">Intervalo atual: {review.interval_days} dias · facilidade {Number(review.ease_factor).toFixed(2)}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><span className="mr-2 self-center text-xs text-slate-500">Como foi?</span>{ratings.map(([label,score]) => <form key={score} action={rateReviewAction}><input type="hidden" name="id" value={review.id} /><input type="hidden" name="score" value={score} /><button className="button-secondary">{label}</button></form>)}</div></article>)}</div>}
  </div>
}
