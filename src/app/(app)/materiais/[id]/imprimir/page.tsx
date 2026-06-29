import Link from 'next/link'
import { ArrowLeft, BookOpen, CalendarDays, GraduationCap } from 'lucide-react'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'

import { PrintButton } from '@/app/(app)/materiais/[id]/imprimir/print-button'
import type { Material } from '@/lib/database.types'
import { formatDate } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export default async function MaterialPrintPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { projeto?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data } = await supabase
    .from('materials')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  const material = data as Material | null

  if (!material) notFound()

  const [{ data: project }, { data: subject }] = await Promise.all([
    supabase
      .from('exam_projects')
      .select('title,organization,position_name')
      .eq('id', material.project_id)
      .eq('user_id', user.id)
      .maybeSingle(),
    material.subject_id
      ? supabase
          .from('subjects')
          .select('name')
          .eq('id', material.subject_id)
          .eq('user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const returnProject = searchParams.projeto ?? material.project_id
  const generatedDate = new Date(material.created_at).toISOString().slice(0, 10)

  return (
    <div className="print-workspace">
      <div className="print-toolbar print-hidden">
        <Link
          href={`/materiais?projeto=${returnProject}`}
          className="button-secondary"
        >
          <ArrowLeft className="size-4" />
          Voltar aos materiais
        </Link>
        <div>
          <p className="text-sm font-bold text-white">Pré-visualização A4</p>
          <p className="text-xs text-slate-500">
            No destino da impressora, escolha “Salvar como PDF”.
          </p>
        </div>
        <PrintButton />
      </div>

      <article className="study-pdf">
        <section className="study-pdf-cover">
          <div className="study-pdf-brand">
            <GraduationCap aria-hidden="true" />
            <span>ConcurseiroPro</span>
          </div>

          <div className="study-pdf-cover-copy">
            <p className="study-pdf-kicker">
              {material.title.startsWith('Apostila')
                ? 'Apostila estratégica'
                : 'Resumo de revisão'}
            </p>
            <h1>{material.title}</h1>
            <p className="study-pdf-subtitle">
              Material personalizado para revisão objetiva e preparação de alto
              rendimento.
            </p>
          </div>

          <div className="study-pdf-meta-grid">
            <div>
              <BookOpen aria-hidden="true" />
              <span>Matéria</span>
              <strong>{subject?.name ?? 'Material geral'}</strong>
            </div>
            <div>
              <GraduationCap aria-hidden="true" />
              <span>Concurso</span>
              <strong>{project?.title ?? 'Plano de estudos'}</strong>
            </div>
            <div>
              <CalendarDays aria-hidden="true" />
              <span>Gerado em</span>
              <strong>{formatDate(generatedDate)}</strong>
            </div>
          </div>

          <div className="study-pdf-cover-footer">
            <p>
              {project?.organization ??
                project?.position_name ??
                'Preparação personalizada'}
            </p>
            <span>Estude. Revise. Avance.</span>
          </div>
        </section>

        <section className="study-pdf-content">
          <header className="study-pdf-running-header">
            <span>ConcurseiroPro</span>
            <span>{subject?.name ?? material.title}</span>
          </header>

          <div className="study-pdf-markdown">
            <ReactMarkdown
              components={{
                blockquote: ({ children }) => (
                  <blockquote>{children}</blockquote>
                ),
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {material.content_md ?? ''}
            </ReactMarkdown>
          </div>

          <footer className="study-pdf-footer">
            <span>
              Material de apoio gerado por IA. Confira normas e fontes oficiais.
            </span>
            <span>ConcurseiroPro</span>
          </footer>
        </section>
      </article>
    </div>
  )
}
