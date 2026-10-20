import { DomainError, fail } from '../domain/errors';
import { applyEvent, compareEvents, rebuild } from '../domain/projection';
import { nextFolio, todayFor } from '../domain/queries';
import { EntityType, EventType, ProducerConfig, TraceEvent, TraceState } from '../domain/types';
import { Clock } from '../platform/clock';
import { EventStore } from '../platform/event-store';
import { isUuid, newId } from '../platform/ids';
import { buildEvent, EventDraft, eventHash } from './event-factory';

export class PermissionError extends Error {}
export class IdempotencyConflict extends Error {}
export class InputError extends Error {}

/** Tipos que se capturan desde la interfaz; el catálogo del caso viene de la carga inicial. */
export const CAPTURE_TYPES: EventType[] = [
  'LotPlanned',
  'LotSown',
  'LotStageChanged',
  'LotTransferred',
  'LossRecorded',
  'LotCancelled',
  'LotClosed',
  'ApplicationRecorded',
  'FertilizationRecorded',
  'InspectionRecorded',
  'QuarantineStarted',
  'QuarantineReleased',
  'DispatchRecorded',
  'EventVoided',
];

const ENTITY_FOR: Partial<Record<EventType, EntityType[]>> = {
  ApplicationRecorded: ['lot', 'location'],
  FertilizationRecorded: ['lot', 'location'],
  InspectionRecorded: ['lot', 'location'],
  DispatchRecorded: ['dispatch'],
  EventVoided: ['event'],
};

export interface CaptureInput {
  id?: string;
  type: EventType;
  entityType: EntityType;
  entityId: string;
  occurredAt?: string;
  operatedAt?: string | null;
  deviceId?: string;
  payload: Record<string, unknown>;
}

export interface RegisterLotInput {
  id?: string;
  folio?: string;
  varietyId: string;
  plantMaterialId?: string | null;
  locationId: string;
  plannedQty?: number;
  operatedAt?: string | null;
  deviceId?: string;
  sow?: { trays: number; cavities: number; quantity: number } | null;
}

export interface SubmitResult {
  events: { id: string; duplicate: boolean }[];
}

export class TraceService {
  private state: TraceState;

  constructor(
    private readonly store: EventStore,
    readonly config: ProducerConfig,
    private readonly clock: Clock,
    private readonly seed: (config: ProducerConfig) => TraceEvent[],
  ) {
    if (store.count() === 0) store.append(seed(config));
    this.state = rebuild(store.all(), config);
  }

  get current(): TraceState {
    return this.state;
  }

  today(): string {
    return todayFor(this.config, this.clock.now());
  }

  user(userId: string | undefined) {
    const user = this.config.users.find((u) => u.id === userId);
    if (!user) throw new PermissionError('Usuario desconocido: elige con quién capturas.');
    return user;
  }

  /** Permisos por rol según la configuración del productor (BR-USR-02). */
  can(userId: string, type: EventType, payload: Record<string, unknown> = {}): boolean {
    const user = this.user(userId);
    const perms = user.roles.flatMap((r) => this.config.roles[r]?.can ?? []);
    if (perms.includes('*')) return true;
    if (!perms.includes(type)) return false;
    if (type === 'LotStageChanged') {
      const stage = this.config.stages.find((s) => s.code === payload.toStage);
      return !!stage && stage.setBy.some((r) => user.roles.includes(r));
    }
    return true;
  }

  /** Registra un lote planificado y, si ya se sembró, su siembra (UC-LOT-01, UC-LOT-02). */
  registerLot(userId: string, input: RegisterLotInput): { lotId: string; folio: string } {
    const lotId = input.id ?? newId();
    if (!isUuid(lotId)) throw new InputError('El identificador del lote no es un UUID.');
    const folio = (input.folio?.trim() || nextFolio(this.state, this.config)).toUpperCase();
    const occurredAt = this.clock.now().toISOString();
    const operatedAt = input.operatedAt ?? null;
    const drafts: CaptureInput[] = [
      {
        id: newId(),
        type: 'LotPlanned',
        entityType: 'lot',
        entityId: lotId,
        occurredAt,
        operatedAt,
        deviceId: input.deviceId,
        payload: {
          folio,
          varietyId: input.varietyId,
          plantMaterialId: input.plantMaterialId ?? null,
          plannedQty: input.sow ? input.sow.quantity : input.plannedQty,
          locationId: input.locationId,
        },
      },
    ];
    if (input.sow) {
      drafts.push({
        id: newId(),
        type: 'LotSown',
        entityType: 'lot',
        entityId: lotId,
        occurredAt,
        operatedAt,
        deviceId: input.deviceId,
        payload: { ...input.sow, locationId: input.locationId },
      });
    }
    this.submit(userId, drafts);
    return { lotId, folio };
  }

  /**
   * Valida y guarda eventos capturados. Reenviar el mismo evento no tiene efecto; el mismo UUID
   * con otro contenido se rechaza (BR-EVT-02). Un evento que no cumple las reglas no se guarda.
   */
  submit(userId: string, inputs: CaptureInput[]): SubmitResult {
    this.user(userId);
    if (inputs.length === 0) throw new InputError('No hay eventos que guardar.');
    const nowIso = this.clock.now().toISOString();
    const results: SubmitResult['events'] = [];
    const fresh: TraceEvent[] = [];
    const seqs = new Map<string, number>();

    for (const input of inputs) {
      if (!CAPTURE_TYPES.includes(input.type))
        throw new InputError(`No se captura ${input.type} desde aquí.`);
      const allowedEntities = ENTITY_FOR[input.type] ?? ['lot'];
      if (!allowedEntities.includes(input.entityType)) {
        throw new InputError(`${input.type} se registra sobre ${allowedEntities.join(' o ')}.`);
      }
      if (!isUuid(input.entityId))
        throw new InputError('El identificador de la entidad no es un UUID.');
      if (!input.payload || typeof input.payload !== 'object')
        throw new InputError('Falta el contenido del evento.');
      if (!this.can(userId, input.type, input.payload)) {
        throw new PermissionError('Tu rol no tiene permiso para esta operación (BR-USR-02).');
      }
      const id = input.id ?? newId();
      if (!isUuid(id)) throw new InputError('El identificador del evento no es un UUID.');
      const occurredAt = input.occurredAt ?? nowIso;
      if (Number.isNaN(Date.parse(occurredAt)))
        throw new InputError('La hora del dispositivo no es válida.');
      const draft: EventDraft = {
        id,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        occurredAt: new Date(occurredAt).toISOString(),
        operatedAt: input.operatedAt ?? null,
        userId,
        deviceId: (input.deviceId ?? 'navegador').slice(0, 64),
        locationId: input.entityType === 'location' ? input.entityId : null,
        payload: input.payload,
      };
      const existing = this.state.events.get(id) ?? fresh.find((e) => e.id === id);
      if (existing) {
        if (existing.hash !== eventHash(draft)) {
          throw new IdempotencyConflict(
            'Ya existe un evento con ese identificador y otro contenido (BR-EVT-02).',
          );
        }
        results.push({ id, duplicate: true });
        continue;
      }
      const next = seqs.get(draft.deviceId) ?? this.store.nextDeviceSeq(draft.deviceId);
      seqs.set(draft.deviceId, next + 1);
      fresh.push(
        buildEvent(draft, {
          recordedAt: nowIso,
          nodeOrigin: this.config.producer.nodeCode,
          deviceSeq: next,
        }),
      );
      results.push({ id, duplicate: false });
    }
    if (fresh.length) this.commit(fresh);
    return { events: results };
  }

  private commit(fresh: TraceEvent[]): void {
    const last = this.state.order.length
      ? this.state.events.get(this.state.order[this.state.order.length - 1])!
      : null;
    const sorted = [...fresh].sort(compareEvents);
    const appendsAtEnd =
      (last === null || compareEvents(last, sorted[0]) < 0) &&
      !fresh.some((e) => e.type === 'EventVoided');

    if (appendsAtEnd) {
      // Aplicación incremental; si falla, se reconstruye para no dejar nada a medias.
      try {
        for (const e of sorted) {
          this.state.events.set(e.id, e);
          applyEvent(this.state, e, this.config);
          this.state.status.set(e.id, { status: 'APPLIED' });
          this.state.order.push(e.id);
        }
      } catch (err) {
        this.state = rebuild(this.store.all(), this.config);
        throw err;
      }
      try {
        this.store.append(sorted);
      } catch (err) {
        this.state = rebuild(this.store.all(), this.config);
        throw err;
      }
      return;
    }

    // Evento atrasado o anulación: se reconstruye en orden (ADR-0013) antes de guardar.
    const candidate = rebuild([...this.store.all(), ...fresh], this.config);
    for (const e of fresh) {
      const st = candidate.status.get(e.id);
      if (st?.status === 'CONFLICT')
        fail(st.code ?? 'BR-EVT-05', st.reason ?? 'El evento no es válido.');
    }
    this.store.append(sorted);
    this.state = candidate;
  }

  /** Regresa el demo a los datos iniciales del caso (ADR-0021). Solo Administrador. */
  reset(userId: string): void {
    const user = this.user(userId);
    if (!user.roles.some((r) => this.config.roles[r]?.can.includes('*'))) {
      throw new PermissionError('Solo el Administrador regresa el demo a los datos iniciales.');
    }
    this.store.reset();
    this.store.append(this.seed(this.config));
    this.state = rebuild(this.store.all(), this.config);
  }

  /** Reconstrucción completa desde los eventos guardados (prueba obligatoria, ARCHITECTURE §5). */
  rebuildFromStore(): TraceState {
    return rebuild(this.store.all(), this.config);
  }
}

export { DomainError };
