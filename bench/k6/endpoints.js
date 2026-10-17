// Benchmark d'un endpoint d'Expense.io — lancé par bench/run.sh, une
// exécution par (CASE, VUS). Voir docs/audit/baseline.md.
//
// Variables : CASE (clé de CASES), VUS, DURATION (mesure à durée fixe),
// ITERATIONS (mesure à nombre fixe d'itérations, pour les décisions qui
// consomment une note à chaque appel), WARMUP, OUT (fichier JSON produit).
import http from 'k6/http'
import exec from 'k6/execution'
import { check } from 'k6'
import { Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'
const CASE = __ENV.CASE
const VUS = Number(__ENV.VUS || 1)
const DURATION = __ENV.DURATION || '30s'
const WARMUP = __ENV.WARMUP || '5s'
const ITERATIONS = Number(__ENV.ITERATIONS || 0)
const WARMUP_ITERATIONS = Number(__ENV.WARMUP_ITERATIONS || 100)

// Doit rester aligné avec bench/seed.mjs.
const PASSWORD = 'bench1234'
const ACCOUNTS = {
  employee: 'employee1@bench.expense.io',
  manager: 'manager1@bench.expense.io',
  hr: 'hr@bench.expense.io',
  managerDecide: 'manager@bench-decide.expense.io',
  hrDecide: 'hr@bench-decide.expense.io',
}
const hex = (n) => n.toString(16).padStart(12, '0')
const userId = (n) => `00000000-0000-4000-a000-${hex(n)}`
const noteId = (n) => `00000000-0000-4000-b000-${hex(n)}`
const poolNoteId = (pool, i) => `00000000-0000-4000-c00${pool}-${hex(i)}`
const EMPLOYEE1 = userId(1001)
const MANAGER1 = userId(101)
const EMPLOYEE1_NOTE = noteId(1 * 1000 + 1)
const MANAGER1_NOTE = noteId(500000 + 1 * 1000 + 1)

const RECEIPT_PNG = open('../fixtures/receipt.png', 'b')
const receiptFile = () => http.file(RECEIPT_PNG, 'receipt.png', 'image/png')

const CASES = {
  login: {
    label: 'POST /api/auth/callback/credentials',
    expected: 302,
    run: (params) => signIn(ACCOUNTS.employee, params),
  },
  'employee-list': {
    label: 'GET /api/expense-notes',
    account: 'employee',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/expense-notes`, params),
  },
  'employee-create': {
    label: 'POST /api/expense-notes',
    account: 'employee',
    expected: 201,
    run: (params) =>
      http.post(
        `${BASE_URL}/api/expense-notes`,
        { amount: '42.50', expenseDate: '2026-10-08', description: 'Taxi bench', receipt: receiptFile() },
        params
      ),
  },
  'employee-receipt-url': {
    label: 'GET /api/expense-notes/{id}/receipt-url',
    account: 'employee',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/expense-notes/${EMPLOYEE1_NOTE}/receipt-url`, params),
  },
  'employee-ocr': {
    label: 'POST /api/expense-notes/receipt-suggestion',
    account: 'employee',
    expected: 200,
    run: (params) =>
      http.post(`${BASE_URL}/api/expense-notes/receipt-suggestion`, { receipt: receiptFile() }, params),
  },
  'manager-list': {
    label: 'GET /api/manager/expense-notes',
    account: 'manager',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/manager/expense-notes`, params),
  },
  'manager-receipt-url': {
    label: 'GET /api/manager/expense-notes/{id}/receipt-url',
    account: 'manager',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/manager/expense-notes/${EMPLOYEE1_NOTE}/receipt-url`, params),
  },
  'manager-approve': {
    label: 'POST /api/manager/expense-notes/{id}/approve',
    account: 'managerDecide',
    expected: 200,
    run: (params, i) => http.post(`${BASE_URL}/api/manager/expense-notes/${poolNoteId(1, i)}/approve`, null, params),
  },
  'manager-reject': {
    label: 'POST /api/manager/expense-notes/{id}/reject',
    account: 'managerDecide',
    expected: 200,
    run: (params, i) => http.post(`${BASE_URL}/api/manager/expense-notes/${poolNoteId(2, i)}/reject`, null, params),
  },
  'hr-list': {
    label: 'GET /api/hr/expense-notes',
    account: 'hr',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/hr/expense-notes`, params),
  },
  'hr-receipt-url': {
    label: 'GET /api/hr/expense-notes/{id}/receipt-url',
    account: 'hr',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/hr/expense-notes/${MANAGER1_NOTE}/receipt-url`, params),
  },
  'hr-approve': {
    label: 'POST /api/hr/expense-notes/{id}/approve',
    account: 'hrDecide',
    expected: 200,
    run: (params, i) => http.post(`${BASE_URL}/api/hr/expense-notes/${poolNoteId(3, i)}/approve`, null, params),
  },
  'hr-reject': {
    label: 'POST /api/hr/expense-notes/{id}/reject',
    account: 'hrDecide',
    expected: 200,
    run: (params, i) => http.post(`${BASE_URL}/api/hr/expense-notes/${poolNoteId(4, i)}/reject`, null, params),
  },
  'hr-users': {
    label: 'GET /api/hr/users',
    account: 'hr',
    expected: 200,
    run: (params) => http.get(`${BASE_URL}/api/hr/users`, params),
  },
  'hr-assign-manager': {
    label: 'PUT /api/hr/users/{id}/manager',
    account: 'hr',
    expected: 200,
    // Réassigne le manager actuel : la requête écrit en base sans changer
    // le jeu de données des autres mesures.
    run: (params) =>
      http.put(`${BASE_URL}/api/hr/users/${EMPLOYEE1}/manager`, JSON.stringify({ managerId: MANAGER1 }), {
        ...params,
        headers: { 'Content-Type': 'application/json' },
      }),
  },
}

const definition = CASES[CASE]
if (!definition) {
  throw new Error(`CASE inconnu : "${CASE}". Valeurs possibles : ${Object.keys(CASES).join(', ')}`)
}

const MAIN = '{phase:measure,kind:main}'
const iterationStart = new Trend('iteration_start_ts')
const iterationEnd = new Trend('iteration_end_ts')

const byIterations = ITERATIONS > 0
export const options = {
  scenarios: {
    warmup: byIterations
      ? { executor: 'shared-iterations', vus: VUS, iterations: WARMUP_ITERATIONS, maxDuration: WARMUP, gracefulStop: '0s', tags: { phase: 'warmup' } }
      : { executor: 'constant-vus', vus: VUS, duration: WARMUP, gracefulStop: '0s', tags: { phase: 'warmup' } },
    measure: byIterations
      ? { executor: 'shared-iterations', vus: VUS, iterations: ITERATIONS, maxDuration: '10m', startTime: WARMUP, tags: { phase: 'measure' } }
      : { executor: 'constant-vus', vus: VUS, duration: DURATION, startTime: WARMUP, tags: { phase: 'measure' } },
  },
  setupTimeout: '2m',
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
  // Seuils toujours vrais : ils servent uniquement à exposer les
  // sous-métriques de la phase de mesure dans handleSummary.
  thresholds: {
    [`http_req_duration${MAIN}`]: ['max>=0'],
    [`http_reqs${MAIN}`]: ['count>=0'],
    'checks{phase:measure}': ['rate>=0'],
    iteration_start_ts: ['min>=0'],
    iteration_end_ts: ['max>=0'],
  },
}

http.setResponseCallback(http.expectedStatuses(200, 201, 302))

function signIn(email, params) {
  const jar = http.cookieJar()
  jar.clear(BASE_URL)
  const csrf = http.get(`${BASE_URL}/api/auth/csrf`, { tags: { kind: 'aux' } }).json('csrfToken')
  return http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    { csrfToken: csrf, email, password: PASSWORD },
    { ...params, redirects: 0 }
  )
}

export function setup() {
  if (!definition.account) return {}
  const response = signIn(ACCOUNTS[definition.account], { tags: { kind: 'aux' } })
  const token = response.cookies['authjs.session-token']?.[0]?.value
  if (!token) {
    throw new Error(`Connexion impossible pour ${ACCOUNTS[definition.account]} (HTTP ${response.status}) — la base de bench est-elle peuplée ?`)
  }
  return { token }
}

export default function (data) {
  const measuring = exec.scenario.name === 'measure'
  // Index unique par appel, pour que chaque décision consomme sa propre note
  // (l'échauffement prend les WARMUP_ITERATIONS premières).
  const index = exec.scenario.iterationInTest + (measuring ? WARMUP_ITERATIONS : 0)
  const params = {
    tags: { kind: 'main', name: definition.label },
    cookies: data.token ? { 'authjs.session-token': data.token } : {},
  }

  const start = Date.now()
  const response = definition.run(params, index)
  if (measuring) {
    iterationStart.add(start)
    iterationEnd.add(Date.now())
  }
  check(response, { [`HTTP ${definition.expected}`]: (r) => r.status === definition.expected })
}

export function handleSummary(data) {
  const values = (name) => data.metrics[name]?.values ?? {}
  const duration = values(`http_req_duration${MAIN}`)
  const requests = values(`http_reqs${MAIN}`).count ?? 0
  const checks = values('checks{phase:measure}')
  const windowSeconds = ((values('iteration_end_ts').max ?? 0) - (values('iteration_start_ts').min ?? 0)) / 1000
  const result = {
    case: CASE,
    endpoint: definition.label,
    vus: VUS,
    mode: byIterations ? `${ITERATIONS} itérations` : DURATION,
    requests,
    windowSeconds,
    throughput: windowSeconds > 0 ? requests / windowSeconds : 0,
    avg: duration.avg,
    med: duration.med,
    p95: duration['p(95)'],
    p99: duration['p(99)'],
    max: duration.max,
    errorRate: checks.fails !== undefined ? checks.fails / Math.max(1, checks.passes + checks.fails) : null,
  }
  const line =
    `${CASE} (${VUS} VU) : ${result.throughput.toFixed(1)} req/s, méd ${result.med?.toFixed(1)} ms, ` +
    `p95 ${result.p95?.toFixed(1)} ms, p99 ${result.p99?.toFixed(1)} ms, erreurs ${((result.errorRate ?? 0) * 100).toFixed(2)} %\n`
  const outputs = { stdout: line }
  if (__ENV.OUT) outputs[__ENV.OUT] = JSON.stringify(result, null, 2) + '\n'
  return outputs
}
