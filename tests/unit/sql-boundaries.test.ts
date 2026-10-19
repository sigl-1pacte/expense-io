import { describe, expect, it } from 'vitest'
import { findSqlViolations } from '../../scripts/check-sql-boundaries.mjs'

describe('frontière SQL entre modules (D4)', () => {
  it('signale une table d’un autre module', () => {
    expect(
      findSqlViolations([
        { path: 'src/modules/expenses/infrastructure/X.ts', content: 'SELECT * FROM users u JOIN expense_notes en ON true' },
        { path: 'src/modules/iam/infrastructure/Y.ts', content: 'UPDATE expense_notes SET status = 1' },
      ])
    ).toEqual([
      'src/modules/expenses/infrastructure/X.ts : table « users » (module iam)',
      'src/modules/iam/infrastructure/Y.ts : table « expense_notes » (module expenses)',
    ])
  })

  it('accepte les tables du module et les mots qui ressemblent', () => {
    expect(
      findSqlViolations([
        { path: 'src/modules/expenses/infrastructure/X.ts', content: 'SELECT user_id FROM expense_notes -- users_count' },
        { path: 'src/modules/iam/infrastructure/Y.ts', content: 'SELECT * FROM users JOIN companies c ON true' },
      ])
    ).toEqual([])
  })
})
