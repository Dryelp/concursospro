import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import type { ExamProject } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: projects }] = await Promise.all([
    supabase.from('profiles').select('nome').eq('id', user.id).maybeSingle(),
    supabase
      .from('exam_projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const userName =
    profile?.nome ||
    (typeof user.user_metadata.nome === 'string' ? user.user_metadata.nome : null) ||
    user.email?.split('@')[0] ||
    'Concurseiro'

  return (
    <AppShell
      projects={(projects ?? []) as ExamProject[]}
      userName={userName}
      userEmail={user.email ?? ''}
    >
      {children}
    </AppShell>
  )
}
