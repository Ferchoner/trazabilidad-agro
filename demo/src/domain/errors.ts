/** Regla de negocio incumplida. `code` cita la regla (BR-xxx-nn) o el caso. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function fail(code: string, message: string): never {
  throw new DomainError(code, message);
}
