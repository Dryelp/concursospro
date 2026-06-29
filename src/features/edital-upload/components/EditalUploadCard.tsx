import { useId } from 'react'
import { FileText, FileUp, Shield, WandSparkles } from 'lucide-react'

import { SurfaceCard } from '../../../components/SurfaceCard'
import type { StudyPlanConfig } from '../../../lib/concurseiro-data'
import type { IngestEditalFileResult } from '../lib/ingest-edital-file'

const uploadSteps = [
  'Enviar PDF oficial ou conjunto de anexos.',
  'Revisar sinais de baixa confianca e disciplinas detectadas.',
  'Salvar o concurso e liberar o cronograma inicial no painel.',
]

const weekDays = [
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sab', value: 6 },
  { label: 'Dom', value: 7 },
]

type EditalUploadCardProps = {
  busy: boolean
  pastedText: string
  sourceLabel: string | null
  result: IngestEditalFileResult | null
  error: string | null
  notice: string | null
  studyPlan: StudyPlanConfig
  requiresAuth: boolean
  onFileSelect: (file: File) => Promise<void> | void
  onPastedTextChange: (value: string) => void
  onProcessText: () => Promise<void> | void
  onStudyPlanChange: <K extends keyof StudyPlanConfig>(key: K, value: StudyPlanConfig[K]) => void
  onToggleStudyDay: (day: number) => void
}

export function EditalUploadCard({
  busy,
  pastedText,
  sourceLabel,
  result,
  error,
  notice,
  studyPlan,
  requiresAuth,
  onFileSelect,
  onPastedTextChange,
  onProcessText,
  onStudyPlanChange,
  onToggleStudyDay,
}: EditalUploadCardProps) {
  const inputId = useId()

  return (
    <SurfaceCard
      eyebrow="Upload inteligente"
      title="Entrada do edital com clareza operacional"
      description="Aqui nasce o projeto do concurso: documento original, parametros da sua rotina e primeira leitura da IA no mesmo fluxo."
    >
      <label className="upload-dropzone" htmlFor={inputId}>
        <div className="upload-dropzone__icon">
          <FileUp size={22} />
        </div>
        <div>
          <strong>
            {busy ? 'Processando e salvando edital...' : 'Solte o edital aqui ou selecione no computador'}
          </strong>
          <p>PDF, imagem ou texto. Tamanho sugerido ate 25 MB.</p>
        </div>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.html,.doc,.docx"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void onFileSelect(file)
            }
            event.currentTarget.value = ''
          }}
        />
      </label>

      <div className="upload-inline-meta">
        <div className="upload-inline-meta__item">
          <FileText size={16} />
          <span>{sourceLabel ?? 'Nenhum arquivo processado ainda'}</span>
        </div>
        {result ? (
          <div className="upload-inline-meta__item">
            <span className="badge badge--soft">{result.provider}</span>
            <span>{result.classification.documentKind.replaceAll('_', ' ')}</span>
          </div>
        ) : null}
      </div>

      <div className="upload-features">
        <div className="upload-feature">
          <Shield size={18} />
          <span>Storage privado e isolamento por usuario</span>
        </div>
        <div className="upload-feature">
          <WandSparkles size={18} />
          <span>Extracao pronta para revisao e cronograma</span>
        </div>
      </div>

      <div className="planner-grid">
        <label className="field">
          <span className="field__label">Nome do projeto</span>
          <input
            className="field__input"
            type="text"
            value={studyPlan.projectTitle}
            onChange={(event) => onStudyPlanChange('projectTitle', event.target.value)}
            placeholder="Ex.: Analista TJ-MG 2026"
          />
        </label>

        <label className="field">
          <span className="field__label">Horas por semana</span>
          <input
            className="field__input"
            type="number"
            min={4}
            max={60}
            value={studyPlan.weeklyHours}
            onChange={(event) =>
              onStudyPlanChange('weeklyHours', Number.parseInt(event.target.value, 10) || 12)
            }
          />
        </label>
      </div>

      <label className="field">
        <span className="field__label">Disciplina ou frente de foco</span>
        <input
          className="field__input"
          type="text"
          value={studyPlan.focusSubject}
          onChange={(event) => onStudyPlanChange('focusSubject', event.target.value)}
          placeholder="Ex.: Constitucional, RLM, Portugues"
        />
      </label>

      <div className="weekday-selector">
        <span className="field__label">Dias disponiveis</span>
        <div className="weekday-selector__list">
          {weekDays.map((day) => {
            const active = studyPlan.studyDays.includes(day.value)

            return (
              <button
                key={day.value}
                type="button"
                className={`weekday-pill${active ? ' weekday-pill--active' : ''}`}
                onClick={() => onToggleStudyDay(day.value)}
              >
                {day.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="text-fallback">
        <textarea
          className="text-fallback__input"
          placeholder="Ou cole aqui o trecho principal do edital para gerar a primeira leitura da IA."
          value={pastedText}
          onChange={(event) => onPastedTextChange(event.target.value)}
        />
        <div className="text-fallback__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void onProcessText()}
            disabled={busy}
          >
            Processar texto colado
          </button>
          {requiresAuth ? (
            <p className="inline-feedback inline-feedback--warning">
              Faca login primeiro para salvar o edital no storage privado e gerar cronograma.
            </p>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="upload-status-grid">
          <div className="upload-status-card">
            <span className="upload-status-card__label">Formato</span>
            <strong>{result.classification.format}</strong>
            <p>{result.classification.reasons[0] ?? 'Classificacao heuristica inicial.'}</p>
          </div>
          <div className="upload-status-card">
            <span className="upload-status-card__label">Confianca</span>
            <strong>{Math.round(result.classification.confidence * 100)}%</strong>
            <p>{result.pageCount ? `${result.pageCount} paginas lidas` : 'Entrada textual direta'}</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="inline-feedback inline-feedback--error">{error}</p> : null}
      {notice ? <p className="inline-feedback inline-feedback--success">{notice}</p> : null}

      <ol className="step-list">
        {uploadSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </SurfaceCard>
  )
}
