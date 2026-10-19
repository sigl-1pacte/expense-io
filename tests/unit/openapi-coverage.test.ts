import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const API_DIR = path.join(process.cwd(), 'src/app/api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** `src/app/api/hr/users/[id]/manager/route.ts` → `/api/hr/users/{id}/manager`. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

function operationsInCode(): string[] {
  return routeFiles(API_DIR)
    .filter((file) => !file.includes('[...nextauth]'))
    .flatMap((file) => {
      const urlPath = `/api/${path
        .relative(API_DIR, path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}'))
        .join('/')}`
      const source = readFileSync(file, 'utf8')
      return METHODS.filter((method) =>
        new RegExp(`export (async function|const) ${method}\\b`).test(source)
      ).map((method) => `${method} ${urlPath}`)
    })
    .sort()
}

function operationsInContract(): string[] {
  const spec = parse(readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>
  }
  return Object.entries(spec.paths)
    .filter(([urlPath]) => !urlPath.startsWith('/api/auth/'))
    .flatMap(([urlPath, item]) =>
      Object.keys(item)
        .filter((key) => METHODS.includes(key.toUpperCase() as (typeof METHODS)[number]))
        .map((method) => `${method.toUpperCase()} ${urlPath}`)
    )
    .sort()
}

describe('contrat OpenAPI', () => {
  it('décrit exactement les routes exposées par le code', () => {
    expect(operationsInContract()).toEqual(operationsInCode())
  })
})
