import { DatabaseSync } from 'node:sqlite';
import { TraceEvent } from '../domain/types';

/**
 * Almacén de eventos en SQLite (ADR-0005, ADR-0008). Solo agrega; nunca edita ni borra,
 * salvo `reset`, que regresa el demo a sus datos iniciales (ADR-0021).
 */
export class EventStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') {
      // Sobrevivir cortes de luz sin no-break (H-12).
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq             INTEGER PRIMARY KEY AUTOINCREMENT,
        id              TEXT NOT NULL UNIQUE,
        type            TEXT NOT NULL,
        entity_type     TEXT NOT NULL,
        entity_id       TEXT NOT NULL,
        occurred_at     TEXT NOT NULL,
        operated_at     TEXT,
        recorded_at     TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        device_id       TEXT NOT NULL,
        node_origin     TEXT NOT NULL,
        device_seq      INTEGER NOT NULL,
        location_id     TEXT,
        payload         TEXT NOT NULL,
        payload_version INTEGER NOT NULL,
        hash            TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_entity ON events (entity_id);
      CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
        BEGIN SELECT RAISE(ABORT, 'Los eventos son inmutables (ADR-0005)'); END;
    `);
  }

  get(id: string): TraceEvent | undefined {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    return row ? toEvent(row as unknown as Row) : undefined;
  }

  all(): TraceEvent[] {
    return (this.db.prepare('SELECT * FROM events ORDER BY seq').all() as unknown as Row[]).map(
      toEvent,
    );
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number }).n);
  }

  nextDeviceSeq(deviceId: string): number {
    const row = this.db
      .prepare('SELECT MAX(device_seq) AS m FROM events WHERE device_id = ?')
      .get(deviceId) as { m: number | null };
    return (row.m ?? 0) + 1;
  }

  /** Guarda varios eventos en una sola transacción. */
  append(events: TraceEvent[]): void {
    const insert = this.db.prepare(`INSERT INTO events
      (id, type, entity_type, entity_id, occurred_at, operated_at, recorded_at, user_id, device_id,
       node_origin, device_seq, location_id, payload, payload_version, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    this.db.exec('BEGIN');
    try {
      for (const e of events) {
        insert.run(
          e.id,
          e.type,
          e.entityType,
          e.entityId,
          e.occurredAt,
          e.operatedAt,
          e.recordedAt,
          e.userId,
          e.deviceId,
          e.nodeOrigin,
          e.deviceSeq,
          e.locationId,
          JSON.stringify(e.payload),
          e.payloadVersion,
          e.hash,
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Solo para el botón "regresar a los datos iniciales" del demo. */
  reset(): void {
    this.db.exec('DELETE FROM events');
  }

  close(): void {
    this.db.close();
  }
}

interface Row {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  occurred_at: string;
  operated_at: string | null;
  recorded_at: string;
  user_id: string;
  device_id: string;
  node_origin: string;
  device_seq: number;
  location_id: string | null;
  payload: string;
  payload_version: number;
  hash: string;
}

function toEvent(r: Row): TraceEvent {
  return {
    id: r.id,
    type: r.type as TraceEvent['type'],
    entityType: r.entity_type as TraceEvent['entityType'],
    entityId: r.entity_id,
    occurredAt: r.occurred_at,
    operatedAt: r.operated_at,
    recordedAt: r.recorded_at,
    userId: r.user_id,
    deviceId: r.device_id,
    nodeOrigin: r.node_origin,
    deviceSeq: Number(r.device_seq),
    locationId: r.location_id,
    payload: JSON.parse(r.payload),
    payloadVersion: Number(r.payload_version),
    hash: r.hash,
  };
}
