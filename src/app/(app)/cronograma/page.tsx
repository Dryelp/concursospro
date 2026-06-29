import { CalendarDays, Sparkles } from 'lucide-react'

import { generateScheduleAction } from '@/app/(app)/cronograma/actions'
import { toggleTaskAction } from '@/app/(app)/dashboard/actions'
import { SectionEmpty } from '@/components/section-empty'
import type { StudyTask } from '@/lib/database.types'
import { formatDate, subjectColor, todayIso } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'

export default async function CronogramaPage({ searchParams }: { searchParams: { projeto?: string; filtro?: string } }) {
  const { supabase, user, project, subjects } = await requireWorkspace(searchParams.projeto)
  if (!project) return <SectionEmpty title="Selecione um edital" description="Crie seu primeiro concurso para gerar o cronograma." />
  const { data } = await supabase.from('study_tasks').select('*').eq('project_id', project.id).eq('user_id', user.id).order('scheduled_for')
  const all = (data ?? []) as StudyTask[]
  const filter = searchParams.filtro ?? 'hoje'
  const end = new Date(`${todayIso()}T12:00:00`); end.setDate(end.getDate() + 7)
  const tasks = filter === 'hoje' ? all.filter((item) => item.scheduled_for === todayIso()) : filter === 'semana' ? all.filter((item) => item.scheduled_for >= todayIso() && item.scheduled_for <= end.toISOString().slice(0, 10)) : all
  const grouped = Object.groupBy(tasks, (item) => item.scheduled_for)
  return <div>
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold">Cronograma</h2><p className="mt-1 text-sm text-slate-500">Plano executável para os próximos dias.</p></div><form action={generateScheduleAction}><input type="hidden" name="projectId" value={project.id} /><button className="button-primary"><Sparkles className="size-4" />Gerar cronograma</button></form></header>
    <div className="mb-5 flex gap-2">{[['hoje','Hoje'],['semana','Esta semana'],['todos','Completo']].map(([value,label]) => <a key={value} href={`/cronograma?projeto=${project.id}&filtro=${value}`} className={`rounded-full border px-4 py-2 text-xs font-bold ${filter === value ? 'border-atlas-400 bg-atlas-400 text-white' : 'border-white/10 text-slate-400'}`}>{label}</a>)}</div>
    {!tasks.length ? <SectionEmpty title="Sem sessões neste período" description="Clique em Gerar cronograma para criar um plano baseado em sua disponibilidade." /> : <div className="space-y-6">{Object.entries(grouped).map(([date, items]) => <section key={date}><p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">{formatDate(date)}</p><div className="space-y-2">{items?.map((task) => {
      const subject = subjects.find((item) => item.id === task.subject_id)
      return <div key={task.id} className={`flex items-center gap-3 rounded-xl border border-white/[0.07] bg-ink-900 p-4 ${task.status === 'done' ? 'opacity-40' : ''}`}><span className="size-2.5 rounded-full" style={{ background: subjectColor(subject?.name ?? task.title) }} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.notes} · {task.duration_min}min</p></div><form action={toggleTaskAction}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="status" value={task.status === 'done' ? 'pending' : 'done'} /><button className="button-secondary">{task.status === 'done' ? 'Reabrir' : 'Concluir'}</button></form></div>
    })}</div></section>)}</div>}
  </div>
}
