import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applySync, planSync } from '../../scripts/agents-sync.mjs'

let root: string
let source: string
let target: string

async function put(dir: string, relative: string, content: string) {
  await mkdir(path.dirname(path.join(dir, relative)), { recursive: true })
  await writeFile(path.join(dir, relative), content)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'agents-sync-'))
  source = path.join(root, '.agents/skills')
  target = path.join(root, '.claude/skills')
  await mkdir(source, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('planSync', () => {
  it('copie un skill absent de la cible', async () => {
    await put(source, 'a/SKILL.md', 'A')
    expect(await planSync(source, target)).toEqual([{ kind: 'copy', relativePath: 'a/SKILL.md' }])
  })

  it('ne fait rien quand les copies sont à jour', async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/SKILL.md', 'A')
    expect(await planSync(source, target)).toEqual([])
  })

  it('recopie un fichier modifié et supprime un fichier disparu de la source', async () => {
    await put(source, 'a/SKILL.md', 'A2')
    await put(target, 'a/SKILL.md', 'A1')
    await put(target, 'a/ancien.md', 'x')
    expect(await planSync(source, target)).toEqual([
      { kind: 'delete', relativePath: 'a/ancien.md' },
      { kind: 'copy', relativePath: 'a/SKILL.md' },
    ])
  })

  it("ignore les dossiers de la cible qui n'ont pas de skill source (fichiers propres à Claude Code)", async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/SKILL.md', 'A')
    await put(target, 'perso/SKILL.md', 'P')
    expect(await planSync(source, target)).toEqual([])
  })
})

describe('applySync', () => {
  it('rend la cible identique à la source', async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/vieux.md', 'x')
    await applySync(source, target, await planSync(source, target))
    expect(await readFile(path.join(target, 'a/SKILL.md'), 'utf8')).toBe('A')
    expect(await planSync(source, target)).toEqual([])
  })
})
