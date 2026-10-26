import { describe, expect, it } from 'vitest'
import { MAX_DECISION_COMMENT_LENGTH, parseDecisionComment } from '@/modules/expenses/domain/DecisionComment'
import { InvalidInput } from '@/shared/errors'

describe('parseDecisionComment', () => {
  it('sans corps ou sans champ : aucun commentaire', () => {
    expect(parseDecisionComment(undefined)).toBeUndefined()
    expect(parseDecisionComment({})).toBeUndefined()
  })

  it('un commentaire vide ou blanc est absent', () => {
    expect(parseDecisionComment({ comment: '' })).toBeUndefined()
    expect(parseDecisionComment({ comment: '   ' })).toBeUndefined()
  })

  it('un commentaire valide est conservé, sans espaces autour', () => {
    expect(parseDecisionComment({ comment: '  Merci de joindre la facture. ' })).toBe('Merci de joindre la facture.')
  })

  it('la limite est incluse, au-delà : 400', () => {
    const limit = 'a'.repeat(MAX_DECISION_COMMENT_LENGTH)
    expect(parseDecisionComment({ comment: limit })).toBe(limit)
    expect(() => parseDecisionComment({ comment: `${limit}a` })).toThrow(InvalidInput)
  })

  it.each([[42], [null], [['x']], [{ a: 1 }]])('un commentaire qui n’est pas du texte (%j) : 400', (comment) => {
    expect(() => parseDecisionComment({ comment })).toThrow(InvalidInput)
  })
})
