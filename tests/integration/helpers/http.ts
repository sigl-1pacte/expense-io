import type { NextRequest } from 'next/server'
import { PNG_BYTES } from '../../support/fixtures'

const ORIGIN = 'http://localhost'

export interface NoteDto {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: string
  createdAt: string
}

export interface UserDto {
  id: string
  name: string
  email: string
  role: string
  managerId: string | null
}

export interface ErrorBody {
  error: string
  stack?: string
}

export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'
export const NON_UUID_IDS = ['abc', '1', "' OR 1=1 --"]

/** Les handlers n'utilisent que l'API standard de Request. */
export function request(path: string, init?: RequestInit): NextRequest {
  return new Request(`${ORIGIN}${path}`, init) as NextRequest
}

export function multipart(path: string, fields: Record<string, string | Blob>): NextRequest {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value)
  }
  return request(path, { method: 'POST', body: form })
}

export function jsonBody(path: string, method: string, payload: unknown): NextRequest {
  return request(path, {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  })
}

export function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Reçu PNG valide par défaut ; `size` produit un fichier de cette taille rempli de zéros. */
export function receiptFile(
  options: { name?: string; type?: string; size?: number; content?: BlobPart } = {}
): File {
  const content =
    options.content ?? (options.size === undefined ? PNG_BYTES : new Uint8Array(options.size))
  return new File([content], options.name ?? 'recu.png', { type: options.type ?? 'image/png' })
}
