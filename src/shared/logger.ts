// Logs JSON, une ligne par événement : lisibles par un agrégateur, et le
// correlationId relie la requête HTTP, l'outbox et le worker.
type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function log(level: Level, message: string, fields: Fields = {}): void {
  const time = new Date().toISOString()
  // Champs d'abord, clés réservées ensuite : un appelant ne peut pas les écraser.
  const entry: Fields = {}
  for (const [key, value] of Object.entries(fields)) entry[key] = serialize(value)
  entry.time = time
  entry.level = level
  entry.message = message
  let line: string
  try {
    line = JSON.stringify(entry)
  } catch {
    // Valeur non sérialisable (circulaire, BigInt, getter qui lève) : le logger ne doit jamais lever.
    line = JSON.stringify({ time, level, message, fields: 'non sérialisable' })
  }
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (message: string, fields?: Fields) => log('info', message, fields),
  warn: (message: string, fields?: Fields) => log('warn', message, fields),
  error: (message: string, fields?: Fields) => log('error', message, fields),
}
