import { describe, expect, it } from 'vitest'

import { parseConteudoLocal } from '@/lib/editais/parse-conteudo'

describe('parseConteudoLocal', () => {
  it('extrai disciplinas e tópicos no formato clássico', () => {
    const result = parseConteudoLocal(`
LÍNGUA PORTUGUESA: Interpretação de texto. Ortografia oficial. Classes de palavras.
DIREITO CONSTITUCIONAL: Direitos fundamentais. Organização do Estado.
`)
    expect(result).toHaveLength(2)
    expect(result[0].nome).toBe('LÍNGUA PORTUGUESA')
    expect(result[0].topicos).toContain('Interpretação de texto')
  })

  it('ignora cabeçalhos que não são matérias', () => {
    const result = parseConteudoLocal('PROVA OBJETIVA: regras gerais. duração total.')
    expect(result).toHaveLength(0)
  })

  it('extrai matérias numeradas e associa subtópicos decimais', () => {
    const result = parseConteudoLocal(`
1 LÍNGUA PORTUGUESA E INTERPRETAÇÃO DE TEXTOS
1.1 Adequação conceitual.
1.2 Ortografia oficial.
2 LITERATURA
2.1 Escolas literárias.
2.2 Literatura brasileira.
3 NOÇÕES DE DIREITO
3.1 Constituição Federal.
3.2 Direitos e garantias fundamentais.
`)

    expect(result.map((item) => item.nome)).toEqual([
      'LÍNGUA PORTUGUESA E INTERPRETAÇÃO DE TEXTOS',
      'LITERATURA',
      'NOÇÕES DE DIREITO',
    ])
    expect(result[0].topicos).toContain('Adequação conceitual')
    expect(result[1].topicos).toContain('Escolas literárias')
  })

  it('aceita títulos numerados com ponto ou parêntese', () => {
    const result = parseConteudoLocal(`
1. MATEMÁTICA
1.1 Razão e proporção.
2) INFORMÁTICA
2.1 Sistemas operacionais.
`)

    expect(result).toHaveLength(2)
  })
})
