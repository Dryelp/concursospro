'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { ArrowRight, BookOpen, LoaderCircle } from 'lucide-react'

import {
  loginAction,
  signupAction,
  type AuthState,
} from '@/app/login/actions'

const initialState: AuthState = {}

function SubmitButton({ mode }: { mode: 'login' | 'signup' }) {
  const { pending } = useFormStatus()

  return (
    <button className="button-primary mt-2 w-full" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Aguarde...
        </>
      ) : (
        <>
          {mode === 'login' ? 'Entrar' : 'Criar conta grátis'}
          <ArrowRight className="size-4" />
        </>
      )}
    </button>
  )
}

export function AuthCard() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loginState, loginFormAction] = useFormState(loginAction, initialState)
  const [signupState, signupFormAction] = useFormState(signupAction, initialState)
  const state = mode === 'login' ? loginState : signupState

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_60%_50%_at_10%_50%,rgba(79,142,247,.12),transparent),radial-gradient(ellipse_40%_40%_at_90%_20%,rgba(167,139,250,.10),transparent)] p-4">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[18px] bg-gradient-to-br from-atlas-400 to-atlas-violet shadow-glow">
            <BookOpen className="size-7 text-white" />
          </div>
          <h1 className="font-display text-[27px] font-extrabold tracking-[-0.04em]">
            ConcurseiroPro
          </h1>
          <p className="mt-1 text-sm text-slate-400">Sua aprovação começa aqui</p>
        </header>

        <section className="rounded-[24px] border border-white/[0.12] bg-ink-900 p-7 shadow-panel">
          <div className="mb-6 flex gap-1 rounded-[10px] bg-ink-850 p-1">
            {[
              ['login', 'Entrar'],
              ['signup', 'Criar conta'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value as 'login' | 'signup')}
                className={`flex-1 rounded-lg px-3 py-2 font-display text-sm font-semibold transition ${
                  mode === value
                    ? 'bg-atlas-400 text-white shadow-[0_2px_12px_rgba(79,142,247,.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {state?.error ? (
            <p className="mb-4 rounded-lg border-l-2 border-atlas-red bg-atlas-red/10 px-4 py-3 text-sm text-atlas-red">
              {state.error}
            </p>
          ) : null}
          {state?.success ? (
            <p className="mb-4 rounded-lg border-l-2 border-atlas-green bg-atlas-green/10 px-4 py-3 text-sm text-atlas-green">
              {state.success}
            </p>
          ) : null}

          <form action={mode === 'login' ? loginFormAction : signupFormAction}>
            {mode === 'signup' ? (
              <label className="mb-4 block">
                <span className="label">Nome completo</span>
                <input className="field" name="nome" placeholder="João Silva" />
              </label>
            ) : null}
            <label className="mb-4 block">
              <span className="label">E-mail</span>
              <input
                className="field"
                name="email"
                type="email"
                placeholder="seu@email.com"
                autoComplete="email"
              />
            </label>
            <label className="mb-4 block">
              <span className="label">Senha</span>
              <input
                className="field"
                name="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            <SubmitButton mode={mode} />
          </form>
        </section>
      </div>
    </main>
  )
}
