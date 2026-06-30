import { describe, expect, it } from 'vitest'

import {
  getExamBoardAlternatives,
  getExamBoardJsonExample,
  getExamBoardProfile,
  getExamBoardPromptContext,
} from '@/lib/bancas'

describe('exam board profiles', () => {
  it('matches aliases without accents or case sensitivity', () => {
    expect(getExamBoardProfile('Cespe')?.name).toBe('Cebraspe')
    expect(getExamBoardProfile('fundacao getulio vargas')?.name).toBe('FGV')
  })

  it('uses C/E for Cebraspe questions', () => {
    expect(getExamBoardAlternatives('Cebraspe')).toEqual(['C', 'E'])
    expect(getExamBoardJsonExample('Cebraspe')).toContain('"letter":"C","text":"Certo"')
    expect(getExamBoardPromptContext('Cebraspe')).toContain('julgamento Certo/Errado')
  })

  it('uses four alternatives for A-D boards', () => {
    expect(getExamBoardAlternatives('IBFC')).toEqual(['A', 'B', 'C', 'D'])
    expect(getExamBoardAlternatives('Selecon')).toEqual(['A', 'B', 'C', 'D'])
  })

  it('falls back to A-E when the board is unknown', () => {
    expect(getExamBoardAlternatives('Banca Nova')).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})
