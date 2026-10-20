import { describe, expect, it } from 'vitest'
import { parseMaxConcurrency } from '@/modules/expenses/infrastructure/TesseractReceiptReader'

describe('parseMaxConcurrency', () => {
  it.each([undefined, '', 'abc', '0', '-1', '1.5'])('%j retombe sur 2', (value) => {
    expect(parseMaxConcurrency(value)).toBe(2)
  })
  it("accepte un entier >= 1", () => {
    expect(parseMaxConcurrency('3')).toBe(3)
  })
})
