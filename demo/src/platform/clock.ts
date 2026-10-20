/** Reloj inyectable para pruebas (ARCHITECTURE.md, Reloj). */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }
  now(): Date {
    return new Date(this.instant);
  }
  set(instant: Date): void {
    this.instant = instant;
  }
}
