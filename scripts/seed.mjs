// Peuple une base de démonstration entièrement navigable dès `make dev` :
// une entreprise avec deux RH, un manager racine, un manager rattaché, des
// employés rattachés et non rattachés, et des notes de frais dans tous les
// états (avec un vrai reçu uploadé) — pour qu'il n'y ait aucune étape manuelle
// (signup, promotion de rôle, soumission d'une note) avant de pouvoir naviguer.
// Idempotent : relançable sans dupliquer les comptes ni les notes.
import bcrypt from 'bcryptjs'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

loadEnv({ quiet: true })

const hrEmail = process.env.SEED_HR_EMAIL ?? 'hr@expense.io'
const hrPassword = process.env.SEED_HR_PASSWORD ?? 'hr1234'
const managerEmail = process.env.SEED_MANAGER_EMAIL ?? 'manager@expense.io'
const managerPassword = process.env.SEED_MANAGER_PASSWORD ?? 'manager1234'
const employeeEmail = process.env.SEED_EMPLOYEE_EMAIL ?? 'demo@expense.io'
const employeePassword = process.env.SEED_EMPLOYEE_PASSWORD ?? 'demo1234'
const domain = hrEmail.split('@')[1]?.toLowerCase()
if (!domain) {
  throw new Error(`Email RH invalide : "${hrEmail}"`)
}

const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL })

// Un PNG 1x1 valide (pas juste des octets arbitraires) : "voir le reçu"
// affiche une vraie image dans le navigateur plutôt qu'un fichier corrompu.
const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
})
const bucket = process.env.S3_BUCKET ?? 'receipts'

async function resolveCompany() {
  const companyName = domain.split('.')[0]
  const inserted = await pool.query(
    `INSERT INTO companies (name, email_domain) VALUES ($1, $2)
     ON CONFLICT (email_domain) DO NOTHING
     RETURNING id`,
    [companyName, domain]
  )
  if (inserted.rows[0]) return inserted.rows[0].id
  const existing = await pool.query('SELECT id FROM companies WHERE email_domain = $1', [domain])
  return existing.rows[0].id
}

async function upsertUser(email, name, password, role, companyId, managerId = null) {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (existing.rows[0]) {
    await pool.query(
      'UPDATE users SET role = $1, company_id = $2, name = $3, manager_id = $4 WHERE id = $5',
      [role, companyId, name, managerId, existing.rows[0].id]
    )
    return existing.rows[0].id
  }
  const passwordHash = await bcrypt.hash(password, 12)
  const inserted = await pool.query(
    'INSERT INTO users (email, name, password_hash, role, company_id, manager_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [email, name, passwordHash, role, companyId, managerId]
  )
  console.log(`Compte ${role} "${email}" créé (mot de passe : "${password}").`)
  return inserted.rows[0].id
}

async function seedExpenseNote(userId, companyId, description, amount, status = 'pending') {
  const existing = await pool.query(
    'SELECT id FROM expense_notes WHERE user_id = $1 AND description = $2',
    [userId, description]
  )
  if (existing.rows[0]) return

  const inserted = await pool.query(
    `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key, status)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, '', $5)
     RETURNING id, receipt_seq`,
    [userId, companyId, amount, description, status]
  )
  const { id, receipt_seq: receiptSeq } = inserted.rows[0]
  const receiptKey = `receipts/${receiptSeq}.png`
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: receiptKey, Body: RECEIPT_PNG, ContentType: 'image/png' })
  )
  await pool.query('UPDATE expense_notes SET receipt_key = $1 WHERE id = $2', [receiptKey, id])
  console.log(`Note de frais "${description}" créée pour ${userId} (${id}).`)
}

try {
  const companyId = await resolveCompany()
  await upsertUser(hrEmail, 'Hr', hrPassword, 'hr_admin', companyId)
  const managerId = await upsertUser(managerEmail, 'Manager', managerPassword, 'manager', companyId)
  const employeeId = await upsertUser(employeeEmail, 'Demo', employeePassword, 'employee', companyId, managerId)

  await seedExpenseNote(employeeId, companyId, 'Taxi aéroport (seed)', 42.5)
  await seedExpenseNote(managerId, companyId, 'Café client (seed)', 5.9)

  const subManagerId = await upsertUser('chef@expense.io', 'Chef d’équipe', 'chef1234', 'manager', companyId, managerId)
  const teamMemberId = await upsertUser('equipe@expense.io', 'Membre d’équipe', 'equipe1234', 'employee', companyId, subManagerId)
  const looseId = await upsertUser('nouveau@expense.io', 'Nouvel arrivant', 'nouveau1234', 'employee', companyId)
  const secondHrId = await upsertUser('rh2@expense.io', 'Seconde RH', 'rh21234', 'hr_admin', companyId)

  await seedExpenseNote(teamMemberId, companyId, 'Train Lyon (seed)', 87.3)
  await seedExpenseNote(looseId, companyId, 'Matériel de bureau (seed)', 24.99)
  await seedExpenseNote(secondHrId, companyId, 'Salon RH (seed)', 120)
  await seedExpenseNote(employeeId, companyId, 'Hôtel Paris (seed)', 142, 'approved')
  await seedExpenseNote(employeeId, companyId, 'Restaurant (seed)', 64.5, 'rejected')

  console.log('')
  console.log('Comptes de démonstration prêts :')
  console.log(`  RH       ${hrEmail} / ${hrPassword}`)
  console.log(`  Manager  ${managerEmail} / ${managerPassword} (racine, sans manager assigné)`)
  console.log(`  Employé  ${employeeEmail} / ${employeePassword} (rattaché au manager ci-dessus)`)
  console.log('  Chef     chef@expense.io / chef1234 (manager rattaché au manager racine, « Chef d’équipe »)')
  console.log('  Équipe   equipe@expense.io / equipe1234 (employé rattaché au chef d’équipe, « Membre d’équipe »)')
  console.log('  Nouveau  nouveau@expense.io / nouveau1234 (« Nouvel arrivant » : sans manager, ses notes vont aux RH)')
  console.log('  RH 2     rh2@expense.io / rh21234 (« Seconde RH » : valide les notes de la première)')
} finally {
  await pool.end()
}
