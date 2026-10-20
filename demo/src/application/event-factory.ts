import { EntityType, EventType, TraceEvent } from '../domain/types';
import { canonicalJson, sha256 } from '../platform/ids';

export interface EventDraft {
  id: string;
  type: EventType;
  entityType: EntityType;
  entityId: string;
  occurredAt: string;
  operatedAt: string | null;
  userId: string;
  deviceId: string;
  locationId?: string | null;
  payload: Record<string, unknown>;
  payloadVersion?: number;
}

/** Huella del contenido capturado: mismo UUID con otra huella se rechaza (BR-EVT-02). */
export function eventHash(d: EventDraft): string {
  return sha256(
    canonicalJson({
      type: d.type,
      entityType: d.entityType,
      entityId: d.entityId,
      occurredAt: d.occurredAt,
      operatedAt: d.operatedAt,
      userId: d.userId,
      deviceId: d.deviceId,
      locationId: d.locationId ?? null,
      payload: d.payload,
      payloadVersion: d.payloadVersion ?? 1,
    }),
  );
}

export function buildEvent(
  d: EventDraft,
  meta: { recordedAt: string; nodeOrigin: string; deviceSeq: number },
): TraceEvent {
  return {
    id: d.id,
    type: d.type,
    entityType: d.entityType,
    entityId: d.entityId,
    occurredAt: d.occurredAt,
    operatedAt: d.operatedAt,
    recordedAt: meta.recordedAt,
    userId: d.userId,
    deviceId: d.deviceId,
    nodeOrigin: meta.nodeOrigin,
    deviceSeq: meta.deviceSeq,
    locationId: d.locationId ?? null,
    payload: d.payload,
    payloadVersion: d.payloadVersion ?? 1,
    hash: eventHash(d),
  };
}
