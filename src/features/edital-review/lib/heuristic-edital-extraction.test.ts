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
})
