import { ChatPanel } from '@/app/(app)/tutor/chat-panel'
import { SectionEmpty } from '@/components/section-empty'
import type { ChatMessage } from '@/lib/database.types'
import { requireWorkspace } from '@/lib/workspace'

export default async function TutorPage({
  searchParams,
}: {
  searchParams: { projeto?: string }
}) {
  const { supabase, user, project } = await requireWorkspace(searchParams.projeto)

  if (!project) {
    return (
      <SectionEmpty
        title="Sem concurso ativo"
        description="Adicione um edital para contextualizar o Professor Atlas."
      />
    )
  }

  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('project_id', project.id)
    .eq('user_id', user.id)
    .order('created_at')
    .limit(50)

  return (
    <ChatPanel
      messages={(data ?? []) as ChatMessage[]}
      projectId={project.id}
      projectTitle={project.title}
    />
  )
}
