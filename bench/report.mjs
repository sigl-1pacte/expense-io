// Agrège les résultats k6 d'une exécution de bench/run.sh en tableaux
// Markdown "Avant / Après" (format de docs/audit/baseline.md).
//
//   node bench/report.mjs <dossier>                    → Avant = <dossier>, Après vide
//   node bench/report.mjs <dossier> --baseline <json>  → Avant = <json>, Après = <dossier>
//
// Écrit aussi <dossier>/summary.json, réutilisable comme --baseline.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [dir, flag, baselinePath] = process.argv.slice(2)
if (!dir || (flag && flag !== '--baseline') || (flag && !baselinePath)) {
  console.error('Usage : node bench/report.mjs <dossier-résultats> [--baseline <summary.json>]')
  process.exit(1)
}

const ORDER = [
  'login',
  'employee-list',
  'employee-create',
  'employee-receipt-url',
  'employee-ocr',
  'manager-list',
  'manager-receipt-url',
  'manager-approve',
  'manager-reject',
  'hr-list',
  'hr-receipt-url',
  'hr-approve',
  'hr-reject',
  'hr-users',
  'hr-assign-manager',
]
const key = (r) => `${r.case}@${r.vus}`
const sortResults = (results) =>
  results.sort((a, b) => ORDER.indexOf(a.case) - ORDER.indexOf(b.case) || a.vus - b.vus)

const current = sortResults(
  readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== 'summary.json')
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')))
)
writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(current, null, 2) + '\n')

const before = baselinePath ? JSON.parse(readFileSync(baselinePath, 'utf8')) : current
const after = baselinePath ? new Map(current.map((r) => [key(r), r])) : new Map()

const ms = (value) => (value === undefined || value === null ? '' : value.toFixed(1))
const cells = (r) =>
  r
    ? [
        r.throughput.toFixed(1),
        ms(r.avg),
        ms(r.med),
        ms(r.p95),
        ms(r.p99),
        ms(r.max),
        `${(r.errorRate * 100).toFixed(2)} %`,
        r.requests,
      ]
    : Array(8).fill('')

const header =
  '| Endpoint | VUs | Version | Débit (req/s) | Moyenne (ms) | Médiane (ms) | P95 (ms) | P99 (ms) | Max (ms) | Erreurs | Requêtes |\n' +
  '|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|'

function table(title, rows) {
  const lines = [`### ${title}`, '', header]
  for (const r of rows) {
    lines.push(`| \`${r.endpoint}\` | ${r.vus} | Avant | ${cells(r).join(' | ')} |`)
    lines.push(`| | | Après | ${cells(after.get(key(r))).join(' | ')} |`)
  }
  return lines.join('\n')
}

console.log(table('Charge unitaire (1 VU)', before.filter((r) => r.vus === 1)))
console.log('')
console.log(table('Charge concurrente', before.filter((r) => r.vus > 1)))
