import { describe, expect, it } from 'vitest'

import { extractEditalHeuristically } from './heuristic-edital-extraction'

describe('extractEditalHeuristically', () => {
  it('mantem topicos dentro da disciplina do conteudo programatico', () => {
    const extraction = extractEditalHeuristically({
      fileName: 'edital.pdf',
      classification: undefined,
      textContent: `
CONTEUDO PROGRAMATICO
LINGUA PORTUGUESA: Interpretacao de textos; Ortografia oficial; Classes de palavras.
DIREITO CONSTITUCIONAL
1.1 Direitos e garantias fundamentais.
1.2 Organizacao do Estado.
ANEXO II
`,
    })

    expect(extraction.subjects).toEqual([
      {
        role: 'LINGUA PORTUGUESA',
        topics: ['Interpretacao de textos', 'Ortografia oficial', 'Classes de palavras'],
      },
      {
        role: 'DIREITO CONSTITUCIONAL',
        topics: ['Direitos e garantias fundamentais', 'Organizacao do Estado'],
      },
    ])
  })

  it('nao transforma teste fisico em disciplina de estudo', () => {
    const extraction = extractEditalHeuristically({
      fileName: 'edital.pdf',
      classification: undefined,
      textContent: `
CONTEUDO PROGRAMATICO
LINGUA PORTUGUESA: Interpretacao de textos; Ortografia oficial.
MATEMATICA: Porcentagem; Razao e proporcao.
TESTE DE CAPACITACAO FISICA
Flexao de braco; Corrida de 12 minutos; Barra fixa.
ANEXO II
`,
    })

    expect(extraction.subjects.map((subject) => subject.role)).toEqual([
      'LINGUA PORTUGUESA',
      'MATEMATICA',
    ])
    expect(JSON.stringify(extraction.subjects)).not.toMatch(/capacitacao|corrida|barra/i)
  })
})
