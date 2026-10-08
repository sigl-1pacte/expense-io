// Crée la base désignée par DATABASE_URL si elle n'existe pas, en se
// connectant à la base "postgres" du même serveur. Passe par DATABASE_URL
// plutôt que par `docker compose exec` pour fonctionner depuis n'importe quel
// dossier (git worktree compris).
import pg from 'pg'

const url = new URL(process.env.DATABASE_URL)
const database = decodeURIComponent(url.pathname.slice(1))
url.pathname = '/postgres'

const client = new pg.Client({ connectionString: url.toString() })
await client.connect()
try {
  const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
  if (existing.rowCount === 0) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`)
    console.log(`Base "${database}" créée.`)
  }
} finally {
  await client.end()
}
