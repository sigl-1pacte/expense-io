// Logs JSON, une ligne par événement : lisibles par un agrégateur, et le
// correlationId relie la requête HTTP, l'outbox et le worker.
type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const NON_SERIALIZABLE = 'non sérialisable'
const RESERVED_KEYS = new Set(['time', 'level', 'message'])

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

/**
 * Instantané de données simples, ou « non sérialisable ». Une seule lecture de la
 * valeur : le JSON.stringify final ne relit donc plus les getters ni les toJSON.
 */
function safeValue(value: unknown): unknown {
  try {
    const json = JSON.stringify(serialize(value))
    return json === undefined ? undefined : JSON.parse(json)
  } catch {
    return NON_SERIALIZABLE
  }
}

function log(level: Level, message: string, fields: Fields = {}): void {
  // Clés réservées posées en premier, puis les champs : un appelant ne peut pas les écraser.
  const entry: Fields = { time: new Date().toISOString(), level, message }
  let pairs: [string, unknown][] = []
  try {
    pairs = Object.entries(fields)
  } catch {
    // Un getter de `fields` lève : on perd les champs, pas le log.
    entry.fields = NON_SERIALIZABLE
  }
  // Sérialisation champ par champ : une valeur fautive n'emporte pas les autres (ex. correlationId).
  for (const [key, value] of pairs) {
    if (RESERVED_KEYS.has(key)) continue
    entry[key] = safeValue(value)
  }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (message: string, fields?: Fields) => log('info', message, fields),
  warn: (message: string, fields?: Fields) => log('warn', message, fields),
  error: (message: string, fields?: Fields) => log('error', message, fields),
}
