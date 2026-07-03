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

  it('encontra conteudo programatico com acento depois de secoes de fases', () => {
    const extraction = extractEditalHeuristically({
      fileName: 'edital.pdf',
      classification: undefined,
      textContent: `
ETAPAS DO CONCURSO
Teste de capacitacao fisica.
Avaliacao psicologica.

ANEXO III
CONTEÚDO PROGRAMÁTICO
NOÇÕES DE DIREITO ADMINISTRATIVO: Atos administrativos; Poderes administrativos; Licitações.
NOÇÕES DE INFORMÁTICA: Sistemas operacionais; Internet; Segurança da informação.
`,
    })

    expect(extraction.subjects).toEqual([
      {
        role: 'NOÇÕES DE DIREITO ADMINISTRATIVO',
        topics: ['Atos administrativos', 'Poderes administrativos', 'Licitações'],
      },
      {
        role: 'NOÇÕES DE INFORMÁTICA',
        topics: ['Sistemas operacionais', 'Internet', 'Segurança da informação'],
      },
    ])
  })

  it('extrai estrutura da prova objetiva quando houver distribuicao por disciplina', () => {
    const extraction = extractEditalHeuristically({
      fileName: 'edital.pdf',
      classification: undefined,
      textContent: `
CONTEÚDO PROGRAMÁTICO
LÍNGUA PORTUGUESA: Interpretação de textos; Ortografia.
MATEMÁTICA: Porcentagem; Razão e proporção.

QUADRO DE PROVAS
Prova objetiva de múltipla escolha, com duração de 4 horas.
LÍNGUA PORTUGUESA: 10 questões
MATEMÁTICA: 5 questões
Total de 15 questões
`,
    })

    expect(extraction.examStructure.totalQuestions).toBe(15)
    expect(extraction.examStructure.durationMinutes).toBe(240)
    expect(extraction.examStructure.disciplines).toEqual([
      expect.objectContaining({ name: 'LÍNGUA PORTUGUESA', questionCount: 10 }),
      expect.objectContaining({ name: 'MATEMÁTICA', questionCount: 5 }),
    ])
  })

  it('extrai estrutura quando tabela do PDF vier quebrada em linhas', () => {
    const extraction = extractEditalHeuristically({
      fileName: 'edital.pdf',
      classification: undefined,
      textContent: `
CONTEÚDO PROGRAMÁTICO
LÍNGUA PORTUGUESA: Compreensão e interpretação de textos; Classes de palavras.
NOÇÕES DE DIREITO: Constituição Federal; Administração pública.

QUADRO DE PROVAS
Prova objetiva
Disciplina
Número de questões
LÍNGUA PORTUGUESA
10
NOÇÕES DE DIREITO
20
Teste de Capacitação Física
50 pontos
Total de 30 questões
`,
    })

    expect(extraction.examStructure.totalQuestions).toBe(30)
    expect(extraction.examStructure.disciplines).toEqual([
      expect.objectContaining({ name: 'LÍNGUA PORTUGUESA', questionCount: 10 }),
      expect.objectContaining({ name: 'NOÇÕES DE DIREITO', questionCount: 20 }),
    ])
  })
})
