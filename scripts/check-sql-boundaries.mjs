// D4 : le SQL d'un module ne nomme que ses propres tables. dependency-cruiser
// voit les imports, pas le SQL : ce script couvre ce trou (CI et npm run verify).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TABLES_BY_MODULE = {
  iam: ['users', 'companies'],
  expenses: ['expense_notes'],
}

const SQL_TABLE_REFERENCE = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_]+)\b/gi

export function findSqlViolations(files) {
  const owner = new Map(
    Object.entries(TABLES_BY_MODULE).flatMap(([moduleName, tables]) => tables.map((table) => [table, moduleName]))
  )
  const violations = []
  for (const { path: file, content } of files) {
    const fileModule = /^src\/modules\/([^/]+)\//.exec(file)?.[1]
    if (!fileModule) continue
    const seen = new Set()
    for (const match of content.matchAll(SQL_TABLE_REFERENCE)) {
      const table = match[1].toLowerCase()
      const tableOwner = owner.get(table)
      if (tableOwner && tableOwner !== fileModule && !seen.has(table)) {
        seen.add(table)
        violations.push(`${file} : table « ${table} » (module ${tableOwner})`)
      }
    }
  }
  return violations
}

async function listTs(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listTs(full)
      return entry.name.endsWith('.ts') ? [full] : []
    })
  )
  return nested.flat()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await Promise.all(
    (await listTs('src/modules')).map(async (file) => ({
      path: file.split(path.sep).join('/'),
      content: await readFile(file, 'utf8'),
    }))
  )
  const violations = findSqlViolations(files)
  if (violations.length > 0) {
    console.error('SQL hors de la frontière du module :')
    for (const violation of violations) console.error(`  ${violation}`)
    process.exit(1)
  }
  console.log('Frontière SQL respectée.')
}
