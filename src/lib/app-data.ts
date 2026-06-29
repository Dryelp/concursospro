export type ExamProjectSummary = {
  title: string
  board: string
  examDate: string
  focus: string
  status: 'Em extracao' | 'Em revisao' | 'Pronto para cronograma'
}

export type DayTask = {
  label: string
  duration: string
  type: string
}

export type ExtractionInsight = {
  title: string
  tone: 'info' | 'alert' | 'success'
  detail: string
}

export const appSnapshot = {
  student: {
    name: 'Seu plano premium',
    stage: 'Construcao da base',
    weeklyHours: 2,
    streak: 12,
  },
  project: {
    title: 'Analista TJ-MG 2026',
    board: 'FGV',
    examDate: '14 set 2026',
    focus: 'Constitucional + Administrativo',
    status: 'Pronto para cronograma',
  } satisfies ExamProjectSummary,
  todayTasks: [
    { label: 'Revisao 24h de Constitucional', duration: '25 min', type: 'Revisao' },
    { label: 'Questoes comentadas de Informatica', duration: '40 min', type: 'Questoes' },
    { label: 'Bloco profundo de Administrativo', duration: '90 min', type: 'Estudo' },
  ] satisfies DayTask[],
  extractionInsights: [
    {
      title: 'Baixa confianca em paginas 12 a 14',
      tone: 'alert',
      detail: 'O conteudo programatico parece ter vindo de quadro escaneado e pede OCR seletivo.',
    },
    {
      title: 'Topicos nucleares mapeados',
      tone: 'success',
      detail: 'Foram identificadas 68 frentes essenciais e 11 assuntos com recorrencia alta.',
    },
    {
      title: 'Retificacao detectada',
      tone: 'info',
      detail: 'Uma nota adicional alterou o peso de Informatica e incluiu Governanca publica.',
    },
  ] satisfies ExtractionInsight[],
}
