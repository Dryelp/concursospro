import type { Metadata } from 'next'

import { AuthCard } from '@/app/login/auth-card'

export const metadata: Metadata = {
  title: 'Entrar',
}

export default function LoginPage() {
  return <AuthCard />
}
