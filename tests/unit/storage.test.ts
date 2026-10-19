import { describe, expect, it } from 'vitest'
import { receiptKeyFor } from '@/lib/storage'

describe('receiptKeyFor', () => {
  it.each<[number, string, string]>([
    [1, '.png', 'receipts/1.png'],
    [42, '.pdf', 'receipts/42.pdf'],
    [7, '', 'receipts/7'],
  ])('(%i, « %s ») → %s', (seq, extension, key) => {
    expect(receiptKeyFor(seq, extension)).toBe(key)
  })
})
