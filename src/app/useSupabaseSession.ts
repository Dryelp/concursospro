import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'

export function useSupabaseSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return useMemo(
    () => ({
      session,
      loading,
      isAuthenticated: Boolean(session?.user),
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      displayName:
        (session?.user.user_metadata.nome as string | undefined) ??
        session?.user.email?.split('@')[0] ??
        null,
    }),
    [loading, session],
  )
}
