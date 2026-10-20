import { Conflict } from '@/shared/errors'

/** Rattachement refusé : manager inconnu, d'une autre entreprise, pas manager, ou cycle. */
export class InvalidManager extends Conflict {
  constructor() {
    super('invalid-manager', 'Invalid manager')
  }
}

/** Inscription avec un email déjà utilisé (y compris par une inscription concurrente, F12). */
export class EmailAlreadyUsed extends Error {
  constructor() {
    super('Email déjà utilisé')
    this.name = 'EmailAlreadyUsed'
  }
}
