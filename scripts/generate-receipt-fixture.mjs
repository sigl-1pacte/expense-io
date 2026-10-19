// Régénère tests/fixtures/receipt.png à partir de receipt.html (ticket lisible
// par Tesseract, utilisé par tests/e2e/ocr-suggestion.spec.ts) :
// `node scripts/generate-receipt-fixture.mjs`.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures')
const html = await readFile(path.join(fixturesDir, 'receipt.html'), 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.setContent(html)
  await page.locator('body').screenshot({ path: path.join(fixturesDir, 'receipt.png') })
} finally {
  await browser.close()
}
console.log('tests/fixtures/receipt.png régénéré.')
