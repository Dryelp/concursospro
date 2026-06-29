import type { MateriaExtraida } from '@/lib/schemas/ia'

const IGNORAR = [
  'CONFORME',
  'SEGUNDO',
  'REFERENTE',
  'CANDIDATO',
  'PROVA',
  'CARGO',
  'VAGA',
  'CONTEÚDO PROGRAMÁTICO',
  'CONHECIMENTOS GERAIS',
  'CONHECIMENTOS ESPECÍFICOS',
]

function pareceTitulo(nome: string) {
  const letras = [...nome].filter((caractere) => /\p{L}/u.test(caractere))
  if (letras.length < 3) return false
  const maiusculas = letras.filter(
    (caractere) => caractere === caractere.toLocaleUpperCase('pt-BR'),
  )
  return maiusculas.length / letras.length >= 0.82
}

function separarTopicos(texto: string) {
  return texto
    .split(/\r?\n|[.;](?=\s|$)/)
    .map((topico) =>
      topico
        .replace(/^\s*\d+(?:\.\d+)+[.)-]?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((topico) => topico.length > 3)
    .slice(0, 100)
}

export function parseConteudoLocal(texto: string): MateriaExtraida[] {
  const materias: MateriaExtraida[] = []
  const vistos = new Set<string>()

  function adicionar(nomeBruto: string, topicosBrutos = '') {
    const nome = nomeBruto
      .replace(/^\s*\d{1,3}[.)-]?\s+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[:.;-]+$/, '')
      .trim()
    const chave = nome.toLocaleUpperCase('pt-BR')

    if (
      nome.length < 3 ||
      nome.length > 120 ||
      !pareceTitulo(nome) ||
      vistos.has(chave) ||
      IGNORAR.some((prefixo) => chave.startsWith(prefixo))
    ) {
      return
    }

    const topicos = separarTopicos(topicosBrutos)
    vistos.add(chave)
    materias.push({
      nome,
      peso: Math.min(5, Math.max(1, Math.ceil(topicos.length / 8) || 1)),
      topicos,
    })
  }

  const linhas = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)

  const tituloNumerado = /^(\d{1,3})[.)-]?\s+(.+)$/
  const subtituloNumerado = /^\d+(?:\.\d+)+[.)-]?\s+/
  const tituloComDoisPontos = /^([\p{Lu}\d][\p{Lu}\p{M}\d\s/&(),.'’-]{2,119})\s*:\s*(.*)$/u

  let indice = 0
  while (indice < linhas.length) {
    const linha = linhas[indice]
    const numerada = linha.match(tituloNumerado)
    const comDoisPontos = linha.match(tituloComDoisPontos)
    const titulo = numerada && pareceTitulo(numerada[2])
      ? numerada[2]
      : comDoisPontos && pareceTitulo(comDoisPontos[1])
        ? comDoisPontos[1]
        : null

    if (!titulo || subtituloNumerado.test(linha)) {
      indice += 1
      continue
    }

    const topicos: string[] = []
    if (comDoisPontos?.[2]) topicos.push(comDoisPontos[2])
    let seguinte = indice + 1

    while (seguinte < linhas.length) {
      const proxima = linhas[seguinte]
      const proximaNumerada = proxima.match(tituloNumerado)
      const proximaComDoisPontos = proxima.match(tituloComDoisPontos)
      const iniciaOutraMateria =
        Boolean(proximaNumerada && pareceTitulo(proximaNumerada[2])) ||
        Boolean(proximaComDoisPontos && pareceTitulo(proximaComDoisPontos[1]))

      if (iniciaOutraMateria && !subtituloNumerado.test(proxima)) break
      topicos.push(proxima)
      seguinte += 1
    }

    adicionar(titulo, topicos.join('\n'))
    indice = seguinte
  }

  return materias
}
