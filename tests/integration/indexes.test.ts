import { describe, expect, it } from 'vitest'
import { testDb } from '../support/db'

describe('index des colonnes de filtre (F16)', () => {
  it.each([
    ['expense_notes_user_created_idx', 'expense_notes', '(user_id, created_at)'],
    ['expense_notes_company_status_idx', 'expense_notes', '(company_id, status)'],
    ['users_manager_idx', 'users', '(manager_id)'],
    ['users_company_idx', 'users', '(company_id)'],
  ])('%s existe sur %s %s', async (name, table, columns) => {
    const { rows } = await testDb().query<{ indexdef: string }>(
      'SELECT indexdef FROM pg_indexes WHERE indexname = $1 AND tablename = $2',
      [name, table]
    )
    expect(rows[0]?.indexdef).toContain(columns)
  })
})
