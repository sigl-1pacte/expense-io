// Écrit le tableau de couverture Vitest en Markdown (résumé du job CI) :
// `node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"`.
import { readFile } from 'node:fs/promises'

const { total } = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'))
const metrics = [
  ['Lignes', 'lines'],
  ['Branches', 'branches'],
  ['Fonctions', 'functions'],
  ['Instructions', 'statements'],
]

console.log(
  [
    '### Couverture Vitest',
    '',
    '| Métrique | % | Couvert |',
    '|---|---|---|',
    ...metrics.map(
      ([label, key]) => `| ${label} | ${total[key].pct} % | ${total[key].covered} / ${total[key].total} |`
    ),
  ].join('\n')
)
