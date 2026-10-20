import { describe, expect, it } from 'vitest'
import { parseNoteSort } from '@/modules/expenses/domain/NoteSort'

describe('parseNoteSort (F3)', () => {
  it.each<[string | null, string]>([
    [null, 'created_at DESC'],
    ['', 'created_at DESC'],
    ['amount ASC', 'amount ASC'],
    ['amount', 'amount ASC'],
    ['expense_date desc', 'expense_date DESC'],
    ['AMOUNT   asc', 'amount ASC'],
    [' expense_date ', 'expense_date ASC'],
    ['created_at DESC', 'created_at DESC'],
  ])('« %s » → %s', (raw, expected) => {
    expect(parseNoteSort(raw)).toBe(expected)
  })

  it.each([
    'nope',
    'amount sideways',
    'created_at; DROP TABLE users',
    "(CASE WHEN (SELECT count(*) FROM users) = 1 THEN amount ELSE -amount END) ASC",
    'user_id ASC',
  ])('« %s » hors liste → tri par défaut', (raw) => {
    expect(parseNoteSort(raw)).toBe('created_at DESC')
  })
})
