import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCheck, Save, ScanSearch } from 'lucide-react'

import { SurfaceCard } from '../../components/SurfaceCard'
import type { ProjectSnapshot, ReviewEdits } from '../../lib/concurseiro-data'
import type { EditalExtraction } from '../../lib/ai/edital-schema'

type EditalReviewPanelProps = {
  extraction: EditalExtraction | null
  warnings: string[]
  currentProject: ProjectSnapshot | null
  saving: boolean
  onSaveReview: (edits: ReviewEdits) => Promise<void> | void
}

function buildInitialDraft(
  extraction: EditalExtraction | null,
  currentProject: ProjectSnapshot | null,
): ReviewEdits {
  const topics = extraction?.subjects.flatMap((subject) => subject.topics).filter(Boolean) ?? []

  return {
    title: currentProject?.title ?? extraction?.title ?? '',
    organization: currentProject?.organization ?? extraction?.institution.name ?? '',
    board: currentProject?.board ?? extraction?.organizer.name ?? '',
    positionName: currentProject?.positionName ?? extraction?.opportunities[0]?.role ?? '',
    examDate: currentProject?.examDate ?? extraction?.exam.examDate ?? '',
    summary: currentProject?.summary ?? extraction?.summary ?? '',
    topicsText: topics.join('\n'),
  }
}

export function EditalReviewPanel({
  extraction,
  warnings,
  currentProject,
  saving,
  onSaveReview,
}: EditalReviewPanelProps) {
  const [draft, setDraft] = useState<ReviewEdits>(() => buildInitialDraft(extraction, currentProject))
  const topicCount = draft.topicsText.split(/\r?\n|;/).filter((topic) => topic.trim()).length

  useEffect(() => {
    setDraft(buildInitialDraft(extraction, currentProject))
  }, [currentProject, extraction])

  const reviewPoints = extraction
    ? [
        {
          title: draft.board ? `Banca: ${draft.board}` : 'Banca ainda sem confianca suficiente',
          detail:
            draft.summary ||
            'Revise os campos antes de aceitar o cronograma como rotina principal.',
          icon: ScanSearch,
        },
        {
          title:
            topicCount > 0 ? `${topicCount} topicos revisaveis` : 'Conteudo programatico vazio',
          detail: 'Cada linha abaixo vira base para disciplinas, revisoes e blocos do cronograma.',
          icon: AlertTriangle,
        },
        {
          title: draft.examDate ? 'Data de prova informada' : 'Data de prova pendente',
          detail: draft.examDate || 'Sem essa data, o cronograma usa ritmo semanal sem contagem regressiva.',
          icon: CheckCheck,
        },
      ]
    : [
        {
          title: 'Aguardando um edital para iniciar a revisao',
          detail:
            'Assim que o arquivo for processado, esta area vira uma mesa de correcao rapida antes do plano.',
          icon: ScanSearch,
        },
      ]

  return (
    <SurfaceCard
      eyebrow="Revisao do edital"
      title="Corrija a leitura antes de travar o plano"
      description="Os campos abaixo sao a ponte entre documento bruto, interpretacao da IA e cronograma diario."
    >
      {currentProject ? (
        <div className="review-project-bar">
          <div>
            <span className="review-highlight__label">Projeto ativo</span>
            <strong>{currentProject.title}</strong>
          </div>
          <span className="badge badge--soft">
            {currentProject.extractionStatus === 'ready' ? 'Pronto' : 'Em revisao'}
          </span>
        </div>
      ) : null}

      <div className="review-stack">
        {reviewPoints.map(({ title, detail, icon: Icon }) => (
          <article key={title} className="review-item">
            <div className="review-item__icon">
              <Icon size={18} />
            </div>
            <div className="review-item__body">
              <strong>{title}</strong>
              <p>{detail}</p>
            </div>
          </article>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="review-warning-list">
          {warnings.slice(0, 4).map((warning) => (
            <p key={warning} className="inline-feedback inline-feedback--warning">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="review-form-grid">
        <label className="field">
          <span className="field__label">Nome do concurso</span>
          <input
            className="field__input"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            disabled={!extraction}
          />
        </label>
        <label className="field">
          <span className="field__label">Orgao</span>
          <input
            className="field__input"
            value={draft.organization}
            onChange={(event) =>
              setDraft((current) => ({ ...current, organization: event.target.value }))
            }
            disabled={!extraction}
          />
        </label>
        <label className="field">
          <span className="field__label">Banca</span>
          <input
            className="field__input"
            value={draft.board}
            onChange={(event) => setDraft((current) => ({ ...current, board: event.target.value }))}
            disabled={!extraction}
          />
        </label>
        <label className="field">
          <span className="field__label">Cargo foco</span>
          <input
            className="field__input"
            value={draft.positionName}
            onChange={(event) =>
              setDraft((current) => ({ ...current, positionName: event.target.value }))
            }
            disabled={!extraction}
          />
        </label>
        <label className="field">
          <span className="field__label">Data da prova</span>
          <input
            className="field__input"
            value={draft.examDate}
            onChange={(event) =>
              setDraft((current) => ({ ...current, examDate: event.target.value }))
            }
            disabled={!extraction}
            placeholder="dd/mm/aaaa"
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Resumo validado</span>
        <textarea
          className="text-fallback__input text-fallback__input--compact"
          value={draft.summary}
          onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
          disabled={!extraction}
        />
      </label>

      <label className="field">
        <span className="field__label">Topicos do conteudo programatico</span>
        <textarea
          className="text-fallback__input"
          value={draft.topicsText}
          onChange={(event) =>
            setDraft((current) => ({ ...current, topicsText: event.target.value }))
          }
          disabled={!extraction}
          placeholder="Um topico por linha"
        />
      </label>

      <div className="review-highlight">
        <div>
          <span className="review-highlight__label">Proxima acao</span>
          <strong>
            {extraction
              ? 'Salvar revisao e regenerar cronograma'
              : 'Envie um edital para liberar a revisao'}
          </strong>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={!extraction || !currentProject || saving}
          onClick={() => void onSaveReview(draft)}
        >
          <Save size={16} />
          {saving ? 'Salvando...' : 'Salvar revisao'}
        </button>
      </div>
    </SurfaceCard>
  )
}
