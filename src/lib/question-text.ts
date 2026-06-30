export type QuestionAlternativeText = {
  text: string
}

const highlightRequiredPattern =
  /\b(destacad[ao]s?|grifad[ao]s?|sublinhad[ao]s?|negrit[ao]s?|em destaque|em negrito)\b/i

export function hasHighlightMarkup(value: string) {
  return /\*\*[^*]{1,160}\*\*/.test(value)
}

export function requiresHighlight(value: string) {
  return highlightRequiredPattern.test(value)
}

export function questionHasRequiredHighlight(input: {
  statement: string
  alternatives: QuestionAlternativeText[]
}) {
  const combined = [input.statement, ...input.alternatives.map((alternative) => alternative.text)]
  const needsHighlight = combined.some(requiresHighlight)

  if (!needsHighlight) return true

  return combined.some(hasHighlightMarkup)
}

export function renderMarkedText(value: string) {
  const parts = value.split(/(\*\*[^*]{1,160}\*\*)/g)

  return parts.map((part, index) => {
    if (hasHighlightMarkup(part)) {
      return {
        key: `${index}-${part}`,
        text: part.slice(2, -2),
        highlighted: true,
      }
    }

    return {
      key: `${index}-${part}`,
      text: part,
      highlighted: false,
    }
  })
}
