import { describe, expect, it } from 'vitest'
import { assertTestDatabase } from '../support/db'

describe('assertTestDatabase', () => {
  it.each([
    'postgres://u:p@localhost:5433/expense_io_test',
    'postgres://u:p@localhost:5433/expense_io_e2e',
  ])('accepte %s', (url) => {
    expect(assertTestDatabase(url)).toBe(url)
  })

  it.each([
    'postgres://u:p@localhost:5433/expense_io',
    'postgres://u:p@localhost:5433/postgres',
    'postgres://u:p@localhost:5433/test_expense',
  ])('refuse %s (base qui ne sert pas aux tests)', (url) => {
    expect(() => assertTestDatabase(url)).toThrow(/refusée/)
  })

  it('refuse une URL absente', () => {
    expect(() => assertTestDatabase(undefined)).toThrow('DATABASE_URL is not set')
  })
})
