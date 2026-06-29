'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BookOpen, CalendarDays, ChevronDown, FileText, GraduationCap, Home, Layers3,
  LogOut, Menu, MessageCircleMore, Settings, Target, X, Zap,
} from 'lucide-react'

import { logoutAction } from '@/app/(app)/actions'
import type { ExamProject } from '@/lib/database.types'

const sections = [
  { label: 'Principal', items: [
    { href: '/dashboard', label: 'Dashboard', icon: Home },
    { href: '/editais', label: 'Meus Editais', icon: Target },
    { href: '/cronograma', label: 'Cronograma', icon: CalendarDays },
  ]},
  { label: 'Estudo', items: [
    { href: '/revisoes', label: 'Revisões', icon: Layers3 },
    { href: '/simulados', label: 'Simulados', icon: FileText },
    { href: '/flashcards', label: 'Flashcards', icon: Zap },
    { href: '/materiais', label: 'Materiais', icon: BookOpen },
    { href: '/tutor', label: 'Prof. Atlas', icon: MessageCircleMore },
  ]},
  { label: 'Conta', items: [
    { href: '/configuracoes', label: 'Configurações', icon: Settings },
  ]},
]

type AppShellProps = {
  children: React.ReactNode
  projects: ExamProject[]
  userName: string
  userEmail: string
}

export function AppShell({ children, projects, userName, userEmail }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentProjectId = searchParams.get('projeto') ?? projects[0]?.id
  const title = sections.flatMap((section) => section.items)
    .find((item) => item.href === pathname)?.label ?? 'ConcurseiroPro'

  function selectProject(projectId: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('projeto', projectId)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="app-shell-root min-h-screen bg-ink-950">
      {mobileOpen ? (
        <button className="fixed inset-0 z-40 bg-black/60 md:hidden" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />
      ) : null}
      <aside className={`app-shell-sidebar fixed inset-y-0 left-0 z-50 flex w-[228px] flex-col border-r border-white/[0.07] bg-ink-900 transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[67px] items-center gap-3 border-b border-white/[0.07] px-[18px]">
          <div className="flex size-[34px] items-center justify-center rounded-[9px] bg-gradient-to-br from-atlas-400 to-atlas-violet">
            <GraduationCap className="size-[18px] text-white" />
          </div>
          <span className="font-display text-[15px] font-bold tracking-tight">ConcurseiroPro</span>
          <button className="ml-auto text-slate-500 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1 mt-3 px-3 font-display text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">{section.label}</p>
              {section.items.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link key={item.href} href={`${item.href}${currentProjectId ? `?projeto=${currentProjectId}` : ''}`}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13px] font-medium transition ${active ? 'bg-atlas-400/10 font-semibold text-atlas-400' : 'text-slate-400 hover:bg-ink-850 hover:text-slate-100'}`}>
                    <Icon className="size-4" />{item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-2.5 rounded-[10px] bg-ink-850 p-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-atlas-400 to-atlas-violet font-display text-xs font-bold">{userName.charAt(0).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{userName}</p>
              <p className="truncate text-[10px] text-slate-500">{userEmail}</p>
            </div>
            <form action={logoutAction}><button className="rounded-md p-1.5 text-slate-600 transition hover:text-atlas-red" title="Sair" aria-label="Sair"><LogOut className="size-4" /></button></form>
          </div>
        </div>
      </aside>
      <div className="app-shell-content min-h-screen md:ml-[228px]">
        <header className="app-shell-header sticky top-0 z-30 flex h-[67px] items-center gap-3 border-b border-white/[0.07] bg-ink-950/85 px-4 backdrop-blur-xl md:px-6">
          <button className="text-slate-400 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu className="size-5" /></button>
          <h1 className="flex-1 font-display text-[15px] font-bold">{title}</h1>
          {projects.length ? (
            <div className="relative">
              <select value={currentProjectId} onChange={(event) => selectProject(event.target.value)}
                aria-label="Concurso ativo"
                className="max-w-[190px] appearance-none rounded-lg border border-white/[0.12] bg-ink-850 py-2 pl-3 pr-8 text-xs text-slate-200 outline-none focus:border-atlas-400">
                {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-3.5 text-slate-500" />
            </div>
          ) : null}
        </header>
        <main className="app-shell-main p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
