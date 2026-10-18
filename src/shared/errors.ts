// Erreurs applicatives typées. Le message est le champ `error` historique de
// l'API : il ne change pas (ADR 0004). La traduction HTTP est dans problem.ts.
export abstract class AppError extends Error {
  abstract readonly status: number
  abstract readonly slug: string
  abstract readonly title: string
  readonly headers: Record<string, string> = {}

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Pas de session, ou session d'un compte qui n'existe plus. */
export class Unauthenticated extends AppError {
  readonly status = 401
  readonly slug = 'unauthenticated'
  readonly title = 'Authentification requise'
  constructor() {
    super('Unauthorized')
  }
}

/** Session valide, mais rôle insuffisant. */
export class Forbidden extends AppError {
  readonly status = 403
  readonly slug = 'forbidden'
  readonly title = 'Accès refusé'
  constructor() {
    super('Unauthorized')
  }
}

export class NotFound extends AppError {
  readonly status = 404
  readonly slug = 'not-found'
  readonly title = 'Ressource introuvable'
  constructor() {
    super('Not found')
  }
}

export class InvalidInput extends AppError {
  readonly status = 400
  readonly slug = 'invalid-input'
  readonly title = 'Requête invalide'
}

export class Conflict extends AppError {
  readonly status = 409
  readonly title = 'Conflit'
  constructor(
    readonly slug: string,
    message: string
  ) {
    super(message)
  }
}

/** Une dépendance (S3…) a échoué : la requête n'a rien écrit. */
export class UpstreamFailure extends AppError {
  readonly status = 502
  readonly title = 'Dépendance indisponible'
  constructor(
    readonly slug: string,
    message: string
  ) {
    super(message)
  }
}

export class Unavailable extends AppError {
  readonly status = 503
  readonly slug = 'unavailable'
  readonly title = 'Service momentanément indisponible'
  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.headers['retry-after'] = String(retryAfterSeconds)
  }
}
