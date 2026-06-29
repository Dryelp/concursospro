'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Subject } from '@/lib/database.types'
import { callIA } from '@/lib/ia'
import { createClient } from '@/lib/supabase/server'

export type MaterialState = { error?: string; success?: string }
const schema = z.object({
  projectId: z.string().uuid(),
  subjectId: z.string().uuid(),
  kind: z.enum(['resumo', 'apostila']),
  topic: z
    .string()
    .trim()
    .min(3, 'Escolha ou informe o tópico do material.')
    .max(200),
})

export async function generateMaterialAction(
  _state: MaterialState,
  formData: FormData,
): Promise<MaterialState> {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  if (!user || !session) return { error: 'Sessão expirada.' }
  const { data } = await supabase.from('subjects').select('*')
    .eq('id', parsed.data.subjectId).eq('user_id', user.id).single()
  const subject = data as Subject | null
  if (!subject || subject.project_id !== parsed.data.projectId) return { error: 'Matéria inválida para este concurso.' }

  try {
    const text = await callIA([{
      role: 'user',
      content: `Produza ${parsed.data.kind === 'apostila' ? 'uma apostila aprofundada para impressão, com aproximadamente 2.500 a 4.000 palavras' : 'um resumo aprofundado para impressão, com aproximadamente 1.200 a 2.000 palavras'}.

MATÉRIA: ${subject.name}
TÓPICO EXCLUSIVO: ${parsed.data.topic}

REGRA CENTRAL: desenvolva profundamente o TÓPICO EXCLUSIVO. Não faça uma visão geral superficial da matéria e não desvie para outros assuntos, exceto quando forem pré-requisitos indispensáveis para explicar o tópico.

Escreva em Markdown claro, didático e focado em concursos públicos brasileiros. Cubra obrigatoriamente:
- título específico e introdução explicando por que o tópico é cobrado;
- definição completa, fundamentos e subdivisões;
- explicação passo a passo dos pontos mais difíceis;
- seções com ## e subseções com ###;
- pelo menos 4 exemplos concretos ou resolvidos;
- diferenças entre conceitos parecidos que costumam confundir candidatos;
- erros mais frequentes e como evitá-los;
- formas de cobrança em provas e palavras-chave para identificação;
- um bloco em citação iniciado por "**Memorize:**";
- um bloco em citação iniciado por "**Pegadinha de prova:**";
- uma seção "## Revisão expressa" com checklist dos pontos essenciais;
- uma seção final "## Questões de fixação" com 5 questões inéditas e gabarito comentado, explicando também por que as alternativas erradas estão incorretas.

Não use frases vagas, repetição para preencher espaço ou tabelas Markdown. Não invente legislação, jurisprudência ou referências. Quando houver risco de desatualização, sinalize que o aluno deve conferir a fonte oficial.`,
    }], {
      task: parsed.data.kind,
      maxTokens: parsed.data.kind === 'apostila' ? 8000 : 6500,
      accessToken: session.access_token,
    })
    const { error } = await supabase.from('materials').insert({
      project_id: parsed.data.projectId, subject_id: subject.id, user_id: user.id,
      title: `${parsed.data.kind === 'apostila' ? 'Apostila' : 'Resumo'} - ${subject.name} - ${parsed.data.topic}`,
      type: 'ai-summary', content_md: text,
    })
    if (error) return { error: error.message }
    revalidatePath('/materiais')
    return { success: 'Material gerado com sucesso.' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao gerar material.' }
  }
}

export async function deleteMaterialAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && id) await supabase.from('materials').delete().eq('id', id).eq('user_id', user.id)
  revalidatePath('/materiais')
}
