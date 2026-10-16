// Réinitialise et peuple la base de benchmark avec un jeu de données
// déterministe (mêmes identifiants, mêmes volumes à chaque exécution) — voir
// docs/audit/baseline.md. Vide TOUTES les tables : refuse donc de tourner sur
// une base dont le nom ne finit pas par "_bench".
import bcrypt from 'bcryptjs'
import pg from 'pg'

// Doit rester aligné avec bench/k6/endpoints.js.
const PASSWORD = 'bench1234'
const MANAGERS = 5
const EMPLOYEES_PER_MANAGER = 20
const NOTES_PER_EMPLOYEE = 60
const PENDING_PER_EMPLOYEE = 5
const NOTES_PER_MANAGER = 40
const PENDING_PER_MANAGER = 20
const POOL_SIZE = Number(process.env.BENCH_POOL_SIZE ?? 2200)

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

try {
  const { rows } = await client.query('SELECT current_database() AS name')
  if (!rows[0].name.endsWith('_bench')) {
    throw new Error(`Refus de vider la base "${rows[0].name}" : son nom doit finir par "_bench".`)
  }

  // Même coût que l'application (src/app/actions/auth.ts) pour que la
  // connexion mesurée soit représentative ; calculé une seule fois.
  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  await client.query('BEGIN')
  await client.query('TRUNCATE expense_notes, users, companies RESTART IDENTITY CASCADE')
  await client.query(`
    CREATE FUNCTION pg_temp.bench_id(prefix text, n bigint) RETURNS uuid
      LANGUAGE sql IMMUTABLE AS $$ SELECT (prefix || lpad(to_hex(n), 12, '0'))::uuid $$
  `)

  const user = (n) => `pg_temp.bench_id('00000000-0000-4000-a000-', ${n})`
  const companyA = `pg_temp.bench_id('00000000-0000-4000-9000-', 1)`
  const companyB = `pg_temp.bench_id('00000000-0000-4000-9000-', 2)`

  await client.query(`
    INSERT INTO companies (id, name, email_domain) VALUES
      (${companyA}, 'bench', 'bench.expense.io'),
      (${companyB}, 'bench-decide', 'bench-decide.expense.io')
  `)

  // Entreprise A : volumes "réalistes" pour les lectures.
  //   hr@bench.expense.io (id 1), manager<m>@ racines (id 100+m),
  //   employee<n>@ rattachés au manager ((n-1)/20)+1 (id 1000+n).
  // Entreprise B : comptes dédiés aux décisions (approve/reject), dont les
  // réserves de notes ne gonflent pas les listes mesurées sur A.
  //   hr@bench-decide.expense.io (id 2), manager@ racine (id 200),
  //   employee@ rattaché à ce manager (id 2000).
  await client.query(
    `
    INSERT INTO users (id, company_id, name, email, password_hash, role, manager_id)
    SELECT ${user(1)}, ${companyA}, 'Bench RH', 'hr@bench.expense.io', $1, 'hr_admin', NULL::uuid
    UNION ALL
    SELECT ${user('100 + m')}, ${companyA}, 'Manager ' || m, 'manager' || m || '@bench.expense.io', $1, 'manager', NULL
      FROM generate_series(1, ${MANAGERS}) m
    UNION ALL
    SELECT ${user(2)}, ${companyB}, 'Bench RH décision', 'hr@bench-decide.expense.io', $1, 'hr_admin', NULL
    UNION ALL
    SELECT ${user(200)}, ${companyB}, 'Manager décision', 'manager@bench-decide.expense.io', $1, 'manager', NULL
    `,
    [passwordHash]
  )
  await client.query(
    `
    INSERT INTO users (id, company_id, name, email, password_hash, role, manager_id)
    SELECT ${user('1000 + n')}, ${companyA}, 'Employé ' || n, 'employee' || n || '@bench.expense.io', $1, 'employee',
           ${user(`100 + (n - 1) / ${EMPLOYEES_PER_MANAGER} + 1`)}
      FROM generate_series(1, ${MANAGERS * EMPLOYEES_PER_MANAGER}) n
    UNION ALL
    SELECT ${user(2000)}, ${companyB}, 'Employé décision', 'employee@bench-decide.expense.io', $1, 'employee', ${user(200)}
    `,
    [passwordHash]
  )

  const note = (n) => `pg_temp.bench_id('00000000-0000-4000-b000-', ${n})`
  const status = (pending) =>
    `CASE WHEN k <= ${pending} THEN 'pending' WHEN k % 2 = 0 THEN 'approved' ELSE 'rejected' END`

  // Notes des employés de A (id 1000*n + k) et des managers racines de A
  // (id 500000 + 1000*m + k).
  await client.query(`
    INSERT INTO expense_notes (id, user_id, amount, expense_date, description, receipt_key, status, created_at)
    SELECT ${note('1000 * n + k')}, ${user('1000 + n')}, (n * k) % 300 + 12.5,
           date '2026-01-01' + (k * 3) % 270, 'Note bench ' || n || '-' || k, 'receipts/bench.png',
           ${status(PENDING_PER_EMPLOYEE)}, timestamptz '2026-01-01' + make_interval(hours => k)
      FROM generate_series(1, ${MANAGERS * EMPLOYEES_PER_MANAGER}) n, generate_series(1, ${NOTES_PER_EMPLOYEE}) k
    UNION ALL
    SELECT ${note('500000 + 1000 * m + k')}, ${user('100 + m')}, (m * k) % 300 + 7.9,
           date '2026-01-01' + (k * 5) % 270, 'Note manager bench ' || m || '-' || k, 'receipts/bench.png',
           ${status(PENDING_PER_MANAGER)}, timestamptz '2026-01-01' + make_interval(hours => k)
      FROM generate_series(1, ${MANAGERS}) m, generate_series(1, ${NOTES_PER_MANAGER}) k
  `)

  // Réserves de notes en attente consommées par les décisions :
  // 1 = approve manager, 2 = reject manager (notes de l'employé de B),
  // 3 = approve RH, 4 = reject RH (notes du manager racine de B).
  await client.query(`
    INSERT INTO expense_notes (id, user_id, amount, expense_date, description, receipt_key, status, created_at)
    SELECT ('00000000-0000-4000-c00' || p || '-' || lpad(to_hex(i), 12, '0'))::uuid,
           CASE WHEN p <= 2 THEN ${user(2000)} ELSE ${user(200)} END,
           i % 300 + 3.2, date '2026-01-01' + i % 270, 'Réserve ' || p || '-' || i, 'receipts/bench.png',
           'pending', timestamptz '2026-01-01' + make_interval(secs => i)
      FROM generate_series(1, 4) p, generate_series(0, ${POOL_SIZE - 1}) i
  `)

  await client.query('COMMIT')
  await client.query('ANALYZE')

  const counts = await client.query(
    `SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM expense_notes) AS notes`
  )
  console.log(`Base de benchmark prête : ${counts.rows[0].users} utilisateurs, ${counts.rows[0].notes} notes.`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
