import { LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react'

import { SurfaceCard } from '../../components/SurfaceCard'

type AuthStatusCardProps = {
  loading: boolean
  pending: boolean
  isAuthenticated: boolean
  email: string | null
  displayName: string | null
  authMode: 'signin' | 'signup'
  authError: string | null
  authNotice: string | null
  form: {
    name: string
    email: string
    password: string
  }
  onFieldChange: (field: 'name' | 'email' | 'password', value: string) => void
  onSubmit: () => Promise<void> | void
  onToggleMode: () => void
  onSignOut: () => Promise<void> | void
}

export function AuthStatusCard({
  loading,
  pending,
  isAuthenticated,
  email,
  displayName,
  authMode,
  authError,
  authNotice,
  form,
  onFieldChange,
  onSubmit,
  onToggleMode,
  onSignOut,
}: AuthStatusCardProps) {
  const authChecks = [
    {
      label: 'Acesso principal',
      value: loading ? 'Verificando...' : isAuthenticated ? 'Conectado' : 'Pendente login',
      icon: ShieldCheck,
    },
    {
      label: 'Projeto alvo',
      value: 'Supabase isolado do Concurseiro Pro',
      icon: Smartphone,
    },
    {
      label: 'Sessao segura',
      value: email ?? 'Login por email e senha para voce e seus 2 amigos.',
      icon: LockKeyhole,
    },
  ]

  return (
    <SurfaceCard
      eyebrow="Acesso"
      title="Seguranca da conta e continuidade"
      description="Autenticacao direta por email e senha, com espaco privado separado do seu SaaS principal."
    >
      <div className="auth-stack">
        {authChecks.map(({ label, value, icon: Icon }) => (
          <div key={label} className="auth-row">
            <div className="auth-row__icon">
              <Icon size={18} />
            </div>
            <div>
              <span className="auth-row__label">{label}</span>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>

      {!isAuthenticated ? (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          {authMode === 'signup' ? (
            <label className="field">
              <span className="field__label">Seu nome</span>
              <input
                className="field__input"
                type="text"
                value={form.name}
                onChange={(event) => onFieldChange('name', event.target.value)}
                placeholder="Como quer aparecer no painel"
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field__label">Email</span>
            <input
              className="field__input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => onFieldChange('email', event.target.value)}
              placeholder="voce@exemplo.com"
            />
          </label>

          <label className="field">
            <span className="field__label">Senha</span>
            <input
              className="field__input"
              type="password"
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(event) => onFieldChange('password', event.target.value)}
              placeholder="Minimo de 6 caracteres"
            />
          </label>

          <div className="auth-form__actions">
            <button type="submit" className="button button--primary" disabled={pending || loading}>
              {pending
                ? 'Processando...'
                : authMode === 'signup'
                  ? 'Criar conta privada'
                  : 'Entrar no painel'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onToggleMode}
              disabled={pending}
            >
              {authMode === 'signup' ? 'Ja tenho conta' : 'Criar conta'}
            </button>
          </div>

          {authError ? <p className="inline-feedback inline-feedback--error">{authError}</p> : null}
          {authNotice ? (
            <p className="inline-feedback inline-feedback--success">{authNotice}</p>
          ) : null}
        </form>
      ) : (
        <div className="auth-session-card">
          <div>
            <span className="auth-row__label">Conta ativa</span>
            <strong>{displayName ?? email}</strong>
            <p>{email}</p>
          </div>
          <button type="button" className="button button--secondary" onClick={() => void onSignOut()}>
            Sair
          </button>
        </div>
      )}
    </SurfaceCard>
  )
}
