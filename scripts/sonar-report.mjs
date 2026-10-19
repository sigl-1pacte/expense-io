// Après `npm run sonar` : attend que SonarQube ait traité l'analyse, puis
// écrit le statut du quality gate et les métriques clés.
//   - Markdown sur stdout (résumé du job CI, ou docs/audit) ;
//   - JSON complet dans sonar-report.json (artefact).
// Ne fait jamais échouer le job sur le quality gate (spec : gate publié, non bloquant).
import { readFile, writeFile } from 'node:fs/promises'

const host = process.env.SONAR_HOST_URL ?? 'http://localhost:9000'
const token = process.env.SONAR_TOKEN
if (!token) {
  console.error('SONAR_TOKEN est requis.')
  process.exit(1)
}
const headers = { authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` }
const get = async (path) => {
  const response = await fetch(new URL(path, host), { headers })
  if (!response.ok) throw new Error(`${path} → ${response.status}`)
  return response.json()
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const reportTask = await readFile('.scannerwork/report-task.txt', 'utf8')
const ceTaskId = /ceTaskId=(.+)/.exec(reportTask)?.[1]
if (!ceTaskId) throw new Error('ceTaskId introuvable dans .scannerwork/report-task.txt')

for (let attempt = 0; ; attempt++) {
  const { task } = await get(`/api/ce/task?id=${ceTaskId}`)
  if (task.status === 'SUCCESS') break
  if (task.status === 'FAILED' || task.status === 'CANCELED') throw new Error(`Analyse ${task.status}`)
  if (attempt > 90) throw new Error('Analyse non terminée après 3 minutes.')
  await sleep(2000)
}

const METRICS = [
  ['bugs', 'Bugs'],
  ['vulnerabilities', 'Vulnérabilités'],
  ['security_hotspots', 'Security hotspots'],
  ['code_smells', 'Code smells'],
  ['duplicated_lines_density', 'Duplication (%)'],
  ['cognitive_complexity', 'Complexité cognitive'],
  ['coverage', 'Couverture (%)'],
  ['ncloc', 'Lignes de code'],
]
const gate = await get('/api/qualitygates/project_status?projectKey=expense-io')
const measures = await get(
  `/api/measures/component?component=expense-io&metricKeys=${METRICS.map(([key]) => key).join(',')}`
)
const valueOf = (key) => measures.component.measures.find((m) => m.metric === key)?.value ?? '—'

await writeFile('sonar-report.json', JSON.stringify({ gate, measures }, null, 2))
console.log(
  [
    `### SonarQube — ${new Date().toISOString().slice(0, 10)} — quality gate : ${gate.projectStatus.status}`,
    '',
    '| Métrique | Valeur |',
    '|---|---|',
    ...METRICS.map(([key, label]) => `| ${label} | ${valueOf(key)} |`),
  ].join('\n')
)
