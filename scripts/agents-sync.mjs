// Copie les skills du standard Agent Skills (.agents/skills/) vers l'emplacement
// lu par Claude Code (.claude/skills/). Pas de lien symbolique : clones Windows
// avec core.symlinks=false (ADR 0001).
//   node scripts/agents-sync.mjs          met à jour les copies
//   node scripts/agents-sync.mjs --check  échoue si une copie diverge (CI)
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function listFiles(dir, base = dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')]
    })
  )
  return files.flat()
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

/** Actions pour que chaque skill de `sourceDir` soit copié à l'identique dans `targetDir`. */
export async function planSync(sourceDir, targetDir) {
  const sourceFiles = await listFiles(sourceDir)
  const skills = new Set(sourceFiles.map((file) => file.split('/')[0]))
  const targetFiles = (await listFiles(targetDir)).filter((file) => skills.has(file.split('/')[0]))
  const deletions = targetFiles
    .filter((file) => !sourceFiles.includes(file))
    .map((relativePath) => ({ kind: 'delete', relativePath }))
  const copies = []
  for (const relativePath of sourceFiles) {
    const targetFile = path.join(targetDir, relativePath)
    const same =
      targetFiles.includes(relativePath) &&
      (await digest(path.join(sourceDir, relativePath))) === (await digest(targetFile))
    if (!same) copies.push({ kind: 'copy', relativePath })
  }
  return [...deletions.sort(byPath), ...copies.sort(byPath)]
}

function byPath(a, b) {
  return a.relativePath.localeCompare(b.relativePath)
}

export async function applySync(sourceDir, targetDir, actions) {
  for (const action of actions) {
    const targetFile = path.join(targetDir, action.relativePath)
    if (action.kind === 'delete') {
      await rm(targetFile, { force: true })
    } else {
      await mkdir(path.dirname(targetFile), { recursive: true })
      await copyFile(path.join(sourceDir, action.relativePath), targetFile)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const source = path.join(root, '.agents/skills')
  const target = path.join(root, '.claude/skills')
  const actions = await planSync(source, target)
  if (process.argv.includes('--check')) {
    if (actions.length > 0) {
      console.error('Copies de skills désynchronisées. Lancer `npm run agents:sync` :')
      for (const action of actions) console.error(`  ${action.kind} ${action.relativePath}`)
      process.exit(1)
    }
    console.log('Skills synchronisés.')
  } else {
    await applySync(source, target, actions)
    console.log(`${actions.length} fichier(s) mis à jour dans .claude/skills.`)
  }
}
