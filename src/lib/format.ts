const SUBJECT_COLORS = [
  '#4F8EF7',
  '#F75F4F',
  '#F7C94F',
  '#4FF7A0',
  '#A78BFA',
  '#4ECDC4',
  '#F472B6',
  '#FB923C',
]

export function todayIso() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export function daysUntil(date: string | null) {
  if (!date) return null
  const target = Date.parse(`${date}T00:00:00Z`)
  const today = Date.parse(`${todayIso()}T00:00:00Z`)
  return Math.ceil((target - today) / 86_400_000)
}

export function formatDate(date: string | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  )
}

export function subjectColor(name: string) {
  const hash = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length]
}

export function editalMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { qtd_materias: 0, conteudo_programatico: '' }
  }

  const metadata = value as Record<string, unknown>
  return {
    qtd_materias:
      typeof metadata.qtd_materias === 'number' ? metadata.qtd_materias : 0,
    conteudo_programatico:
      typeof metadata.conteudo_programatico === 'string'
        ? metadata.conteudo_programatico
        : '',
  }
}
