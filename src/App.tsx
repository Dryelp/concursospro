import { useEffect, useState } from 'react'

import './App.css'
import { AppShell } from './components/AppShell'
import { SurfaceCard } from './components/SurfaceCard'
import { useEditalWorkspace } from './app/useEditalWorkspace'
import { useSupabaseSession } from './app/useSupabaseSession'
import { supabase } from './lib/supabase'
import { AuthStatusCard } from './features/auth/AuthStatusCard'
import { CronogramaSection } from './features/cronograma/CronogramaSection'
import { DashboardOverview } from './features/dashboard/DashboardOverview'
import { EditalReviewPanel } from './features/edital-review/EditalReviewPanel'
import { EditalUploadCard } from './features/edital-upload/components/EditalUploadCard'

type AuthMode = 'signin' | 'signup'

function App() {
  const auth = useSupabaseSession()
  const editalWorkspace = useEditalWorkspace(auth.session)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [authForm, setAuthForm] = useState({
    name: '',
    email: '',
    password: '',
  })

  useEffect(() => {
    if (auth.isAuthenticated) {
      setAuthError(null)
      setAuthNotice(null)
      setAuthForm((current) => ({
        ...current,
        password: '',
      }))
    }
  }, [auth.isAuthenticated])

  async function handleAuthSubmit() {
    const email = authForm.email.trim()
    const password = authForm.password.trim()
    const name = authForm.name.trim()

    if (!email || !password) {
      setAuthError('Preencha email e senha para continuar.')
      return
    }

    if (authMode === 'signup' && name.length < 2) {
      setAuthError('Informe um nome curto para identificar sua conta no painel.')
      return
    }

    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              nome: name,
            },
          },
        })

        if (error) {
          throw error
        }

        setAuthNotice(
          data.session
            ? 'Conta criada e conectada. Seu espaco privado ja pode receber editais.'
            : 'Conta criada. Se o projeto exigir confirmacao de email, finalize no seu inbox e volte para entrar.',
        )

        if (!data.session) {
          setAuthMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          throw error
        }

        setAuthNotice('Login concluido. Seu painel privado foi carregado.')
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Falha na autenticacao.')
    } finally {
      setAuthPending(false)
    }
  }

  async function handleSignOut() {
    setAuthPending(true)
    setAuthError(null)
    setAuthNotice(null)

    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }

      setAuthNotice('Sessao encerrada com seguranca.')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Falha ao encerrar a sessao.')
    } finally {
      setAuthPending(false)
    }
  }

  return (
    <AppShell>
      <DashboardOverview
        isAuthenticated={auth.isAuthenticated}
        dataLoading={editalWorkspace.dataLoading}
        currentProject={editalWorkspace.currentProject}
        recentProjects={editalWorkspace.recentProjects}
        studyTasks={editalWorkspace.studyTasks}
        weeklyHours={editalWorkspace.studyPlan.weeklyHours}
        onSelectProject={editalWorkspace.selectProject}
      />

      <section className="app-grid app-grid--feature" aria-label="Fluxo do edital">
        <EditalUploadCard
          busy={editalWorkspace.busy}
          pastedText={editalWorkspace.pastedText}
          sourceLabel={editalWorkspace.sourceLabel}
          result={editalWorkspace.result}
          error={editalWorkspace.error}
          notice={editalWorkspace.notice}
          studyPlan={editalWorkspace.studyPlan}
          requiresAuth={!auth.isAuthenticated}
          onFileSelect={editalWorkspace.processFile}
          onPastedTextChange={editalWorkspace.updatePastedText}
          onProcessText={editalWorkspace.processPastedText}
          onStudyPlanChange={editalWorkspace.updateStudyPlan}
          onToggleStudyDay={editalWorkspace.toggleStudyDay}
        />
        <EditalReviewPanel
          extraction={editalWorkspace.extraction}
          warnings={editalWorkspace.warnings}
          currentProject={editalWorkspace.currentProject}
          saving={editalWorkspace.reviewSaving}
          onSaveReview={editalWorkspace.saveReview}
        />
      </section>

      <section className="app-grid app-grid--support" aria-label="Acompanhamento do aluno">
        <CronogramaSection
          tasks={editalWorkspace.studyTasks}
          updatingTaskId={editalWorkspace.taskUpdatingId}
          onUpdateTaskStatus={editalWorkspace.updateTaskStatus}
        />
        <div className="stack-column">
          <AuthStatusCard
            loading={auth.loading}
            pending={authPending}
            isAuthenticated={auth.isAuthenticated}
            email={auth.email}
            displayName={auth.displayName}
            authMode={authMode}
            authError={authError}
            authNotice={authNotice}
            form={authForm}
            onFieldChange={(field, value) =>
              setAuthForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSubmit={handleAuthSubmit}
            onToggleMode={() => {
              setAuthMode((current) => (current === 'signup' ? 'signin' : 'signup'))
              setAuthError(null)
              setAuthNotice(null)
            }}
            onSignOut={handleSignOut}
          />
          <SurfaceCard
            eyebrow="Mentoria"
            title="Proxima alavanca de desempenho"
            description="O painel passa a refletir seu concurso salvo, mas continua te guiando pelo que traz ganho rapido na semana."
          >
            <div className="mentor-brief">
              <div>
                <span className="mentor-brief__label">Foco imediato</span>
                <strong>
                  {editalWorkspace.currentProject?.positionName
                    ? `${editalWorkspace.currentProject.positionName} em ritmo controlado`
                    : 'Suba o primeiro edital e ative o plano de ataque'}
                </strong>
              </div>
              <button type="button" className="button button--secondary">
                Abrir plano guiado
              </button>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  )
}

export default App
