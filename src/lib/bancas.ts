export type ExamBoardFormat = 'certo_errado' | 'multipla_escolha_a_d' | 'multipla_escolha_a_e'

export type ExamBoardProfile = {
  name: string
  aliases: string[]
  format: ExamBoardFormat
  difficulty: 'medio' | 'medio-alto' | 'alto'
  chargeProfile: string[]
  traps: string[]
  generationTone: string
  generationRules: string[]
  atlasBefore: string[]
  atlasAfter: string[]
  alerts: string[]
  promptSummary: string
}

const DEFAULT_ALTERNATIVES = ['A', 'B', 'C', 'D', 'E']

const profiles = [
  {
    name: 'Cebraspe',
    aliases: ['Cespe', 'CEBRASPE'],
    format: 'certo_errado',
    difficulty: 'alto',
    chargeProfile: ['lei seca', 'jurisprudencia', 'casos hipoteticos', 'gramatica contextual'],
    traps: ['termo absoluto', 'excecao omitida', 'afirmacao parcialmente correta', 'regra trocada'],
    generationTone: 'tecnico, assertivo e sintetico',
    generationRules: [
      'gere item unico para julgamento Certo ou Errado',
      'use alternativa C para Certo e E para Errado',
      'se o gabarito for Errado, introduza apenas um erro nuclear e sutil',
      'evite perguntas diretas e alternativas longas',
    ],
    atlasBefore: [
      'em Cebraspe, um unico detalhe falso derruba o item inteiro',
      'procure palavras absolutas, excecoes e troca de competencia',
    ],
    atlasAfter: [
      'aponte o termo que tornou o item certo ou errado',
      'mostre a versao corrigida da frase quando houver erro',
    ],
    alerts: ['nao julgue por familiaridade', 'trechos literais podem esconder uma excecao falsa'],
    promptSummary:
      'Cebraspe/Cespe: formato Certo ou Errado, assertiva tecnica, alta precisao semantica, pegadinhas por excecao, competencia, termo absoluto e afirmacao parcialmente correta.',
  },
  {
    name: 'FGV',
    aliases: ['Fundacao Getulio Vargas', 'FGV Conhecimento'],
    format: 'multipla_escolha_a_e',
    difficulty: 'alto',
    chargeProfile: ['interpretacao textual', 'aplicacao pratica', 'doutrina', 'jurisprudencia'],
    traps: ['alternativa parcialmente correta', 'comando negativo', 'extrapolacao', 'sinonimo imperfeito'],
    generationTone: 'analitico, sofisticado e interpretativo',
    generationRules: [
      'gere alternativas A-E semanticamente proximas',
      'exija interpretacao do caso, texto ou comando',
      'crie distratores por alcance, pressuposto ou aplicacao errada',
    ],
    atlasBefore: ['leia o comando antes das alternativas', 'compare as duas alternativas mais fortes pelo detalhe tecnico'],
    atlasAfter: ['explique por que a correta e mais precisa', 'mostre a falha dos distratores mais sedutores'],
    alerts: ['a alternativa mais completa nem sempre e a correta', 'vocabulario sofisticado pode esconder erro simples'],
    promptSummary:
      'FGV: multipla escolha A-E, enunciados interpretativos, alternativas densas e proximas, foco em inferencia, aplicacao pratica e erro de alcance.',
  },
  {
    name: 'FCC',
    aliases: ['Fundacao Carlos Chagas'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio-alto',
    chargeProfile: ['lei seca', 'gramatica normativa', 'jurisprudencia consolidada'],
    traps: ['detalhe normativo trocado', 'excecao legal', 'prazo trocado', 'enumeracao incompleta'],
    generationTone: 'formal, tecnico e direto',
    generationRules: [
      'use comando objetivo',
      'priorize precisao normativa',
      'crie alternativas com diferencas discretas',
    ],
    atlasBefore: ['confira prazos, sujeitos e competencias', 'em Portugues, analise a funcao sintatica antes da regra'],
    atlasAfter: ['mostre a base normativa ou gramatical', 'compare a correta com a quase correta'],
    alerts: ['a banca pune leitura apressada', 'alternativas elegantes podem conter detalhe falso'],
    promptSummary:
      'FCC: multipla escolha A-E, estilo formal, lei seca e gramatica normativa, distratores por prazo, sujeito, requisito ou excecao.',
  },
  {
    name: 'Vunesp',
    aliases: ['Fundacao Vunesp', 'VUNESP'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['interpretacao textual', 'gramatica normativa', 'lei seca', 'matematica basica'],
    traps: ['troca de palavra', 'alternativa incompleta', 'negacao discreta', 'calculo simples com distracao'],
    generationTone: 'claro, objetivo e escolarizado',
    generationRules: [
      'use enunciado direto',
      'evite complexidade artificial',
      'use distratores por confusao comum ou extrapolacao textual',
    ],
    atlasBefore: ['volte ao trecho citado em questoes de texto', 'nao complique alem do necessario'],
    atlasAfter: ['explique o caminho mais curto', 'mostre por que o distrator era sedutor'],
    alerts: ['literalidade ainda pesa', 'alternativa que copia o texto pode mudar o sentido'],
    promptSummary:
      'Vunesp: multipla escolha A-E, enunciado objetivo, dificuldade media, interpretacao e gramatica pratica, distratores por troca de termo ou extrapolacao.',
  },
  {
    name: 'Instituto AOCP',
    aliases: ['AOCP'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'interpretacao textual', 'gramatica normativa', 'legislacao especial'],
    traps: ['correta/incorreta', 'excecao normativa', 'conceito incompleto', 'prazo trocado'],
    generationTone: 'objetivo, tecnico e moderadamente direto',
    generationRules: [
      'use comandos explicitos',
      'inclua distrator por literalidade incompleta',
      'em legislacao, cobre artigo, excecao e competencia',
    ],
    atlasBefore: ['confirme se o comando pede correta ou incorreta', 'procure palavras que mudam o alcance da regra'],
    atlasAfter: ['resuma a regra cobrada', 'mostre o detalhe que invalidou o distrator'],
    alerts: ['comandos negativos exigem releitura', 'questoes simples podem cobrar excecao'],
    promptSummary:
      'Instituto AOCP: multipla escolha A-E, comando explicito, lei seca e aplicacao moderada, distratores por excecao, prazo e conceito incompleto.',
  },
  {
    name: 'IBFC',
    aliases: ['Instituto Brasileiro de Formacao e Capacitacao'],
    format: 'multipla_escolha_a_d',
    difficulty: 'medio',
    chargeProfile: ['decoreba', 'gramatica normativa', 'lei seca', 'interpretacao simples'],
    traps: ['conceito invertido', 'detalhe literal da lei', 'erro gramatical sutil', 'opcao parcialmente correta'],
    generationTone: 'direto, didatico e objetivo',
    generationRules: [
      'use enunciado curto',
      'gere exatamente quatro alternativas A-D',
      'cobre uma habilidade por questao',
    ],
    atlasBefore: ['resolva primeiro pelo conceito central', 'nao subestime questao curta'],
    atlasAfter: ['explique a regra em linguagem simples', 'mostre por que cada alternativa errada falha'],
    alerts: ['detalhes da lei podem decidir', 'atencao a crase, ortografia e acentuacao'],
    promptSummary:
      'IBFC: multipla escolha A-D, enunciados curtos, cobranca direta, gramatica normativa e lei seca, distratores por conceito invertido ou literalidade.',
  },
  {
    name: 'Consulplan',
    aliases: ['Instituto Consulplan', 'CONSULPLAN'],
    format: 'multipla_escolha_a_d',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'interpretacao textual', 'gramatica normativa', 'legislacao local'],
    traps: ['alternativa incompleta', 'requisito trocado', 'excecao omitida', 'comando negativo'],
    generationTone: 'objetivo e tecnico moderado',
    generationRules: [
      'gere exatamente quatro alternativas A-D',
      'priorize literalidade e aplicacao simples',
      'use distratores por requisito, excecao ou conceito proximo',
    ],
    atlasBefore: ['identifique se o comando pede correta ou incorreta', 'compare a alternativa com a regra literal'],
    atlasAfter: ['aponte a palavra que mudou o requisito', 'sugira revisao da regra e da excecao'],
    alerts: ['bancas A-D exigem eliminacao rapida', 'legislacao local pode decidir a questao'],
    promptSummary:
      'Consulplan: multipla escolha A-D, enunciado objetivo, lei seca e conteudo especifico, distratores por requisito incompleto, excecao ou literalidade alterada.',
  },
  {
    name: 'Quadrix',
    aliases: ['Instituto Quadrix', 'QUADRIX'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['legislacao institucional', 'etica', 'direito administrativo basico', 'portugues direto'],
    traps: ['competencia de orgao trocada', 'dever institucional invertido', 'termo absoluto', 'norma especifica'],
    generationTone: 'objetivo, normativo e institucional',
    generationRules: [
      'se o edital indicar certo/errado, use C/E; sem essa indicacao, use A-E',
      'priorize legislacao especifica, etica e conceitos objetivos',
      'use distratores por orgao, competencia ou dever',
    ],
    atlasBefore: ['confirme o formato no edital quando for Quadrix', 'em conselhos, revise resolucao e codigo de etica'],
    atlasAfter: ['explique a pegadinha institucional', 'resuma a regra em formato regra/excecao'],
    alerts: ['um detalhe falso derruba item C/E', 'norma especifica pesa muito'],
    promptSummary:
      'Quadrix: pode variar entre C/E e A-E conforme edital; sem formato explicito, use A-E. Forte em legislacao institucional, etica e competencias.',
  },
  {
    name: 'IADES',
    aliases: ['Instituto Americano de Desenvolvimento'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'conhecimentos especificos', 'legislacao institucional', 'gramatica normativa'],
    traps: ['conceito tecnico trocado', 'alternativa parcialmente correta', 'excecao normativa', 'detalhe de procedimento'],
    generationTone: 'formal, tecnico e direto',
    generationRules: [
      'alinhe ao conteudo programatico',
      'use alternativas tecnicamente proximas',
      'inclua distrator por excecao ou detalhe tecnico',
    ],
    atlasBefore: ['identifique o objeto tecnico da pergunta', 'separe regra geral e excecao'],
    atlasAfter: ['explique o conceito em etapas', 'mostre por que o distrator parecia correto'],
    alerts: ['as alternativas podem diferir por uma palavra', 'nao responda so por familiaridade'],
    promptSummary:
      'IADES: multipla escolha A-E, formal e tecnico, forte em conteudo programatico, procedimentos, legislacao institucional e excecoes.',
  },
  {
    name: 'Idecan',
    aliases: ['IDECAN', 'Instituto de Desenvolvimento Educacional Cultural e Assistencial Nacional'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'gramatica normativa', 'interpretacao', 'legislacao local'],
    traps: ['palavra trocada', 'comando negativo', 'excecao omitida', 'conceito invertido'],
    generationTone: 'objetivo, normativo e pratico',
    generationRules: [
      'use enunciado objetivo',
      'priorize literalidade e conceito central',
      'crie distratores por termo trocado ou excecao omitida',
    ],
    atlasBefore: ['destaque correta/incorreta no comando', 'procure termo trocado ou generalizacao'],
    atlasAfter: ['mostre o detalhe textual da pegadinha', 'recomende revisao por lei seca'],
    alerts: ['o formato pode variar por edital', 'nao ignore legislacao local'],
    promptSummary:
      'IDECAN: multipla escolha A-E por padrao, cobranca objetiva, lei seca, gramatica normativa e distratores por literalidade alterada.',
  },
  {
    name: 'Instituto Access',
    aliases: ['Access', 'Instituto ACCESS', 'ACCESS'],
    format: 'multipla_escolha_a_d',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'gramatica normativa', 'interpretacao objetiva', 'legislacao institucional'],
    traps: ['literalidade incompleta', 'termo tecnico trocado', 'comando negativo', 'excecao legal'],
    generationTone: 'direto, simples e normativo',
    generationRules: [
      'gere exatamente quatro alternativas A-D',
      'use comandos explicitos',
      'crie distratores curtos por literalidade ou conceito invertido',
    ],
    atlasBefore: ['verifique se o edital usa quatro ou cinco alternativas', 'compare os termos com a lei'],
    atlasAfter: ['de explicacao objetiva', 'aponte o termo que causou o erro'],
    alerts: ['nao superinterprete enunciado direto', 'detalhes literais importam'],
    promptSummary:
      'Instituto Access: multipla escolha A-D por padrao, questoes diretas, lei seca e distratores curtos por termo tecnico ou literalidade.',
  },
  {
    name: 'Selecon',
    aliases: ['Instituto Selecon', 'SELECON'],
    format: 'multipla_escolha_a_d',
    difficulty: 'medio',
    chargeProfile: ['interpretacao textual', 'gramatica normativa', 'matematica basica', 'lei seca'],
    traps: ['alternativa parecida', 'comando negativo', 'erro simples de calculo', 'extrapolacao textual'],
    generationTone: 'claro, pratico e direto',
    generationRules: [
      'gere exatamente quatro alternativas A-D',
      'use enunciado curto ou medio',
      'em legislacao, priorize regra literal',
    ],
    atlasBefore: ['identifique o comando', 'em texto, localize a informacao no trecho'],
    atlasAfter: ['explique com passo a passo curto', 'mostre a eliminacao dos distratores'],
    alerts: ['nao erre por pressa', 'questoes simples podem ter comando invertido'],
    promptSummary:
      'Selecon: multipla escolha A-D, enunciados claros, interpretacao direta, gramatica normativa, matematica basica e lei seca.',
  },
  {
    name: 'Fundatec',
    aliases: ['FUNDATEC', 'Fundacao Universidade Empresa de Tecnologia e Ciencias'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['lei seca', 'legislacao local', 'portugues normativo', 'raciocinio logico'],
    traps: ['legislacao local', 'alternativa parcialmente correta', 'conceito trocado', 'calculo com detalhe'],
    generationTone: 'objetivo, tecnico e regionalizado quando aplicavel',
    generationRules: [
      'use linguagem direta',
      'cobre conteudo literal do edital',
      'inclua legislacao local quando pertinente',
    ],
    atlasBefore: ['verifique legislacao local', 'em RLM, monte os dados antes de calcular'],
    atlasAfter: ['aponte a palavra que invalida o distrator', 'indique revisao de legislacao local'],
    alerts: ['legislacao local pode decidir a prova', 'questao objetiva nao significa facil'],
    promptSummary:
      'Fundatec: multipla escolha A-E, objetiva, forte em legislacao local, portugues normativo, RLM e conhecimentos especificos.',
  },
  {
    name: 'Cesgranrio',
    aliases: ['Fundacao Cesgranrio', 'CESGRANRIO'],
    format: 'multipla_escolha_a_e',
    difficulty: 'medio',
    chargeProfile: ['interpretacao textual', 'matematica financeira', 'raciocinio logico', 'conhecimentos bancarios'],
    traps: ['dado numerico ignorado', 'calculo proximo', 'interpretacao superficial', 'termo tecnico semelhante'],
    generationTone: 'claro, pratico e aplicado',
    generationRules: [
      'use enunciado claro e aplicado',
      'em calculo, inclua distratores numericos plausiveis',
      'em texto, use distratores por interpretacao superficial',
    ],
    atlasBefore: ['identifique dados relevantes', 'em calculo, organize formula, taxa e unidade'],
    atlasAfter: ['mostre passo a passo do calculo ou interpretacao', 'explique por que numeros proximos estao errados'],
    alerts: ['nao subestime enunciado simples', 'taxa ou periodo errado muda tudo'],
    promptSummary:
      'Cesgranrio: multipla escolha A-E, enunciados claros e aplicados, forte em interpretacao, matematica financeira, RLM e conhecimentos bancarios.',
  },
] satisfies ExamBoardProfile[]

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getExamBoardProfile(board?: string | null) {
  const query = normalize(board ?? '')
  if (!query) return null

  return profiles.find((profile) => {
    const names = [profile.name, ...profile.aliases].map(normalize)
    return names.some((name) => query === name || query.includes(name) || name.includes(query))
  }) ?? null
}

export function getExamBoardAlternatives(board?: string | null) {
  const profile = getExamBoardProfile(board)
  if (profile?.format === 'certo_errado') return ['C', 'E']
  if (profile?.format === 'multipla_escolha_a_d') return ['A', 'B', 'C', 'D']
  return DEFAULT_ALTERNATIVES
}

export function getExamBoardQuestionFormat(board?: string | null) {
  const profile = getExamBoardProfile(board)
  return profile?.format ?? 'multipla_escolha_a_e'
}

export function getExamBoardPromptContext(board?: string | null) {
  const profile = getExamBoardProfile(board)
  const alternatives = getExamBoardAlternatives(board)

  if (!profile) {
    return [
      'BANCA: nao informada ou nao reconhecida.',
      'Use padrao geral de concurso publico brasileiro.',
      'Formato obrigatorio: multipla escolha com exatamente 5 alternativas A, B, C, D e E.',
    ].join('\n')
  }

  const alternativeContract = profile.format === 'certo_errado'
    ? 'Formato obrigatorio: julgamento Certo/Errado com exatamente 2 alternativas: {"letter":"C","text":"Certo"} e {"letter":"E","text":"Errado"}. O correctAnswer deve ser "C" ou "E".'
    : `Formato obrigatorio: multipla escolha com exatamente ${alternatives.length} alternativas ${alternatives.join(', ')}. O correctAnswer deve ser uma dessas letras.`

  return [
    `BANCA: ${profile.name}.`,
    `Padrao da banca: ${profile.promptSummary}`,
    `Tom de geracao: ${profile.generationTone}.`,
    `Pegadinhas tipicas: ${profile.traps.join('; ')}.`,
    `Regras especificas: ${profile.generationRules.join('; ')}.`,
    alternativeContract,
  ].join('\n')
}

export function getExamBoardJsonExample(board?: string | null) {
  const alternatives = getExamBoardAlternatives(board)
  const isTrueFalse = getExamBoardQuestionFormat(board) === 'certo_errado'
  const items = alternatives.map((letter) => {
    const text = isTrueFalse ? (letter === 'C' ? 'Certo' : 'Errado') : '...'
    return `{"letter":"${letter}","text":"${text}"}`
  })

  return `{"questions":[{"statement":"...","alternatives":[${items.join(',')}],"correctAnswer":"${alternatives[0]}","explanation":"..."}]}`
}

export function getExamBoardAtlasContext(board?: string | null) {
  const profile = getExamBoardProfile(board)
  if (!profile) return null

  return {
    name: profile.name,
    before: profile.atlasBefore.join(' '),
    after: profile.atlasAfter.join(' '),
    alerts: profile.alerts.join(' '),
    traps: profile.traps.slice(0, 3).join(', '),
  }
}
