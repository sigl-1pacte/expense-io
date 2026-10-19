// F3 : le tri n'est jamais du SQL fourni par le client. Seules les
// combinaisons de cette liste blanche sont possibles ; tout le reste donne le
// tri par défaut (pas d'erreur : aucun client existant ne casse).
const COLUMNS = ['created_at', 'expense_date', 'amount'] as const
const DIRECTIONS = ['ASC', 'DESC'] as const
const DEFAULT_SORT = 'created_at DESC'

export function parseNoteSort(raw: string | null): string {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 2) return DEFAULT_SORT
  const column = parts[0].toLowerCase()
  const direction = (parts[1] ?? 'ASC').toUpperCase()
  if (!(COLUMNS as readonly string[]).includes(column)) return DEFAULT_SORT
  if (!(DIRECTIONS as readonly string[]).includes(direction)) return DEFAULT_SORT
  return `${column} ${direction}`
}
