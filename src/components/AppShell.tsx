import type { ReactNode } from 'react'
import {
  BellRing,
  BookOpenText,
  BrainCircuit,
  CalendarRange,
  Flame,
  Home,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react'

type AppShellProps = {
  children: ReactNode
}

const navigationItems = [
  { label: 'Visao geral', icon: Home, active: true },
  { label: 'Cronograma', icon: CalendarRange },
  { label: 'Revisao do edital', icon: BookOpenText },
  { label: 'Upload inteligente', icon: Upload },
  { label: 'Ritmo de estudo', icon: BrainCircuit },
]

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="brand-mark">
          <div className="brand-mark__seal">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="brand-mark__eyebrow">Concurseiro Pro</p>
            <strong className="brand-mark__title">Area do aluno</strong>
          </div>
        </div>

        <nav className="shell__nav" aria-label="Navegacao principal">
          {navigationItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`nav-link${active ? ' nav-link--active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card__header">
            <Flame size={18} />
            <span>Constancia premium</span>
          </div>
          <strong>12 dias seguidos</strong>
          <p>
            Seu melhor horario segue entre 06h10 e 07h40. Vale proteger esse bloco
            no cronograma desta semana.
          </p>
        </div>
      </aside>

      <main className="shell__main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operacao do aluno</p>
            <h1>Painel de performance para quem estuda com intencao</h1>
            <p className="lede">
              Consolide edital, revise com criterio e transforme a rotina em
              execucao previsivel.
            </p>
          </div>

          <div className="topbar__actions">
            <button type="button" className="icon-button" aria-label="Buscar">
              <Search size={18} />
            </button>
            <button type="button" className="icon-button" aria-label="Notificacoes">
              <BellRing size={18} />
            </button>
            <button type="button" className="button button--primary">
              Revisar edital agora
            </button>
          </div>
        </header>

        <div className="shell__content">{children}</div>
      </main>
    </div>
  )
}
