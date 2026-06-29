import { FlashGenerator } from '@/app/(app)/flashcards/generator'
import { ReviewDeck } from '@/app/(app)/flashcards/review-deck'
import { SectionEmpty } from '@/components/section-empty'
import type { Flashcard } from '@/lib/database.types'
import { todayIso } from '@/lib/format'
import { requireWorkspace } from '@/lib/workspace'
export default async function FlashcardsPage({searchParams}:{searchParams:{projeto?:string}}){const{supabase,user,project,subjects}=await requireWorkspace(searchParams.projeto);if(!project)return <SectionEmpty title="Sem concurso ativo" description="Adicione um edital antes de criar flashcards."/>;const{data}=await supabase.from('flashcards').select('*').eq('project_id',project.id).eq('user_id',user.id).eq('suspended',false).order('created_at',{ascending:false});const all=(data??[]) as Flashcard[];const due=all.filter(c=>!c.next_review_at||c.next_review_at<=todayIso());return <div><header className="mb-5"><h2 className="font-display text-xl font-extrabold">Flashcards</h2><p className="mt-1 text-sm text-slate-500">Memorização ativa com repetição espaçada.</p></header>{subjects.length?<FlashGenerator projectId={project.id} subjects={subjects}/>:null}{due.length?<ReviewDeck cards={due}/>:<SectionEmpty title="Nenhum flashcard pendente" description={all.length?'Suas próximas revisões ainda não venceram.':'Gere seu primeiro baralho por matéria.'}/>}</div>}
