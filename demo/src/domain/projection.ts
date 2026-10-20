// Aplicación de eventos al estado (proyección). Cada manejador valida todo antes de cambiar
// el estado, así un evento inválido no se aplica a medias (ADR-0013).

import { addDays, isIsoDate, localDate } from './dates';
import { DomainError, fail } from './errors';
import {
  CORE_STAGES,
  emptyState,
  LEVEL_ORDER,
  Lot,
  ProducerConfig,
  TERMINAL_STAGES,
  TraceEvent,
  TraceState,
} from './types';

type Handler = (state: TraceState, event: TraceEvent, config: ProducerConfig) => void;

const FOLIO_RE = /^[A-Z]{1,4}-\d{3,6}(-[A-Z])?$/;

/** Orden determinista de ADR-0013: hora del dispositivo, nodo de origen, secuencia del dispositivo. */
export function compareEvents(a: TraceEvent, b: TraceEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1;
  if (a.nodeOrigin !== b.nodeOrigin) return a.nodeOrigin < b.nodeOrigin ? -1 : 1;
  if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
  if (a.deviceSeq !== b.deviceSeq) return a.deviceSeq - b.deviceSeq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Fecha de la operación: la capturada o, si no hay, la fecha local del dispositivo (BR-EVT-06). */
export function operationDate(event: TraceEvent, config: ProducerConfig): string {
  return event.operatedAt ?? localDate(event.occurredAt, config.producer.timeZone);
}

// ---------- utilidades de validación ----------

function str(payload: Record<string, unknown>, key: string, code: string, label: string): string {
  const v = payload[key];
  if (typeof v !== 'string' || v.trim() === '') fail(code, `Falta ${label}.`);
  return v.trim();
}

function optStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function positiveInt(
  payload: Record<string, unknown>,
  key: string,
  code: string,
  label: string,
): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    fail(code, `${label} debe ser un número entero mayor que cero.`);
  }
  return v;
}

function getLot(state: TraceState, id: string): Lot {
  const lot = state.lots.get(id);
  if (!lot) fail('LOT-NOT-FOUND', 'El lote no existe.');
  return lot;
}

function requireActive(lot: Lot): void {
  if (TERMINAL_STAGES.includes(lot.stage)) {
    fail('BR-LOT-04', `El lote ${lot.folio} ya terminó (${lot.stage}).`);
  }
}

function requireSown(lot: Lot): void {
  if (lot.sowingDate === null) fail('BR-LOT-03', `El lote ${lot.folio} todavía no se siembra.`);
}

/** La fecha de la operación no puede ser futura ni anterior a la siembra del lote (BR-EVT-06). */
function checkOperatedAt(event: TraceEvent, config: ProducerConfig, lot?: Lot): void {
  if (event.operatedAt === null) return;
  if (!isIsoDate(event.operatedAt)) fail('BR-EVT-06', 'La fecha de la operación no es válida.');
  const deviceDay = localDate(event.occurredAt, config.producer.timeZone);
  if (event.operatedAt > deviceDay)
    fail('BR-EVT-06', 'La fecha de la operación no puede ser futura.');
  if (lot?.sowingDate && event.operatedAt < lot.sowingDate) {
    fail(
      'BR-EVT-06',
      `La fecha de la operación es anterior a la siembra del lote ${lot.folio} (${lot.sowingDate}).`,
    );
  }
}

function getLocation(state: TraceState, id: unknown, code = 'LOCATION-NOT-FOUND') {
  const loc = typeof id === 'string' ? state.locations.get(id) : undefined;
  if (!loc) fail(code, 'La ubicación no existe.');
  return loc;
}

/** Un lote sembrado está en un sector o en una mesa (BR-LOT-11; mesa por confirmar = sector). */
function requirePlantable(state: TraceState, id: unknown) {
  const loc = getLocation(state, id);
  if (loc.level !== 'TABLE' && loc.level !== 'SECTOR') {
    fail('BR-UBI-01', 'El lote se ubica en una mesa o, si falta la mesa, en un sector.');
  }
  return loc;
}

export function isInSubtree(state: TraceState, locationId: string, rootId: string): boolean {
  let cur: string | null = locationId;
  while (cur !== null) {
    if (cur === rootId) return true;
    cur = state.locations.get(cur)?.parentId ?? null;
  }
  return false;
}

/** Ubicación del lote en una fecha, según sus transferencias (BR-LOT-11). */
export function locationAt(lot: Lot, date: string): string | null {
  let found: string | null = null;
  for (const h of lot.locationHistory) if (h.from <= date) found = h.locationId;
  return found;
}

/** Lotes activos en la ubicación (o debajo) en esa fecha: a ellos se liga una labor (ADR-0012). */
export function lotsAtLocation(state: TraceState, locationId: string, date: string): Lot[] {
  const result: Lot[] = [];
  for (const lot of state.lots.values()) {
    if (lot.sowingDate === null || lot.sowingDate > date) continue;
    if (lot.endedAt !== null && lot.endedAt < date) continue;
    const at = locationAt(lot, date);
    if (at !== null && isInSubtree(state, at, locationId)) result.push(lot);
  }
  return result;
}

/** Por qué un lote no puede entregarse en una fecha por intervalo de seguridad (BR-LAB-03). */
export function safetyBlock(state: TraceState, lot: Lot, date: string): DomainError | null {
  const apps = lot.applications.filter((a) => a.date <= date);
  for (const a of apps) {
    if (a.until !== null && a.until > date) {
      const p = state.products.get(a.productId);
      return new DomainError(
        'BR-LAB-03',
        `El lote ${lot.folio} está en intervalo de seguridad hasta el ${a.until} (${p?.name ?? 'aplicación'} del ${a.date}).`,
      );
    }
  }
  const latest = apps.reduce<(typeof apps)[number] | null>(
    (acc, a) => (acc === null || a.date >= acc.date ? a : acc),
    null,
  );
  if (latest && latest.until === null) {
    const p = state.products.get(latest.productId);
    return new DomainError(
      'P-19',
      `La aplicación más reciente del lote ${lot.folio} (${p?.name ?? ''}, ${latest.date}) no tiene intervalo de seguridad. Entregar así está PENDIENTE DE DECISIÓN (P-19).`,
    );
  }
  return null;
}

/** Cantidad en 0: CERRADO si tuvo entregas, PERDIDO si no (BR-LOT-06). */
function settleIfEmpty(lot: Lot, date: string): void {
  if (lot.currentQty === 0) {
    lot.stage = lot.dispatchedQty > 0 ? CORE_STAGES.closed : CORE_STAGES.lost;
    lot.endedAt = date;
    lot.hold = 'LIBRE';
    lot.holdReason = null;
  }
}

function stageConfig(config: ProducerConfig, code: string) {
  return config.stages.find((s) => s.code === code);
}

function linkEvent(lot: Lot, eventId: string): void {
  if (!lot.eventIds.includes(eventId)) lot.eventIds.push(eventId);
}

/** Lotes a los que aplica una labor sobre lote o ubicación. */
function laborTargets(state: TraceState, event: TraceEvent, config: ProducerConfig): Lot[] {
  const date = operationDate(event, config);
  if (event.entityType === 'lot') {
    const lot = getLot(state, event.entityId);
    requireSown(lot);
    requireActive(lot);
    checkOperatedAt(event, config, lot);
    return [lot];
  }
  if (event.entityType === 'location') {
    getLocation(state, event.entityId);
    checkOperatedAt(event, config);
    return lotsAtLocation(state, event.entityId, date);
  }
  return fail('EVENT-INVALID', 'La labor se registra sobre un lote o una ubicación.');
}

// ---------- manejadores por tipo ----------

const handlers: Record<string, Handler> = {
  LocationCreated(state, e) {
    const p = e.payload;
    const code = str(p, 'code', 'BR-UBI-02', 'el código');
    const name = str(p, 'name', 'BR-UBI-01', 'el nombre');
    const level = p.level as (typeof LEVEL_ORDER)[number];
    if (!LEVEL_ORDER.includes(level)) fail('BR-UBI-01', 'Nivel de ubicación no válido.');
    if ([...state.locations.values()].some((l) => l.code === code)) {
      fail('BR-UBI-02', `El código ${code} ya existe.`);
    }
    const parentId = optStr(p, 'parentId');
    if (level === 'CENTER') {
      if (parentId !== null)
        fail('BR-UBI-01', 'El centro de producción no cuelga de otra ubicación.');
    } else {
      const parent = getLocation(state, parentId, 'BR-UBI-01');
      if (LEVEL_ORDER.indexOf(parent.level) !== LEVEL_ORDER.indexOf(level) - 1) {
        fail('BR-UBI-01', 'Cada ubicación cuelga del nivel inmediato superior.');
      }
    }
    state.locations.set(e.entityId, { id: e.entityId, code, name, level, parentId });
  },

  VarietyCreated(state, e) {
    const name = str(e.payload, 'name', 'UC-CAT-01', 'el nombre');
    const key = name.toLowerCase();
    if ([...state.varieties.values()].some((v) => v.name.toLowerCase() === key)) {
      fail('UC-CAT-01', `La variedad ${name} ya existe.`);
    }
    state.varieties.set(e.entityId, { id: e.entityId, name });
  },

  PlantMaterialRegistered(state, e) {
    const p = e.payload;
    const varietyId = str(p, 'varietyId', 'UC-CAT-02', 'la variedad');
    if (!state.varieties.has(varietyId)) fail('UC-CAT-02', 'La variedad no existe.');
    state.materials.set(e.entityId, {
      id: e.entityId,
      varietyId,
      origin: str(p, 'origin', 'UC-CAT-02', 'el origen'),
      supplier: optStr(p, 'supplier'),
      document: optStr(p, 'document'),
    });
  },

  ProductRegistered(state, e) {
    const p = e.payload;
    const days = p.safetyIntervalDays;
    if (days !== null && (typeof days !== 'number' || !Number.isInteger(days) || days < 0)) {
      fail('UC-CAT-03', 'El intervalo de seguridad es un número de días o queda pendiente.');
    }
    state.products.set(e.entityId, {
      id: e.entityId,
      name: str(p, 'name', 'UC-CAT-03', 'el nombre'),
      activeIngredient: str(p, 'activeIngredient', 'UC-CAT-03', 'el ingrediente activo'),
      safetyIntervalDays: days as number | null,
    });
  },

  LotPlanned(state, e, config) {
    const p = e.payload;
    const folio = str(p, 'folio', 'BR-LOT-01', 'el folio').toUpperCase();
    if (!FOLIO_RE.test(folio))
      fail('BR-LOT-01', `El folio ${folio} no tiene el formato corto (L-0821).`);
    if (state.folios.has(folio)) fail('BR-LOT-01', `El folio ${folio} ya existe.`);
    if (state.lots.has(e.entityId)) fail('BR-LOT-01', 'El lote ya existe.');
    const varietyId = str(p, 'varietyId', 'UC-LOT-01', 'la variedad');
    if (!state.varieties.has(varietyId)) fail('UC-LOT-01', 'La variedad no existe.');
    const materialId = optStr(p, 'plantMaterialId');
    if (materialId !== null) {
      const m = state.materials.get(materialId);
      if (!m) fail('UC-LOT-01', 'El material vegetal no existe.');
      if (m.varietyId !== varietyId) fail('UC-LOT-01', 'El material vegetal es de otra variedad.');
    }
    const plannedQty = positiveInt(p, 'plannedQty', 'UC-LOT-01', 'La cantidad planeada');
    const locationId = optStr(p, 'locationId');
    if (locationId !== null) requirePlantable(state, locationId);
    checkOperatedAt(e, config);

    const n = Number(folio.split('-')[1]);
    if (n > state.lastFolioNumber) state.lastFolioNumber = n;
    state.folios.set(folio, e.entityId);
    state.lots.set(e.entityId, {
      id: e.entityId,
      folio,
      varietyId,
      plantMaterialId: materialId,
      stage: CORE_STAGES.planned,
      hold: 'LIBRE',
      holdReason: null,
      plannedQty,
      initialQty: 0,
      currentQty: 0,
      lostQty: 0,
      dispatchedQty: 0,
      trays: 0,
      cavities: 0,
      plannedAt: operationDate(e, config),
      sowingDate: null,
      endedAt: null,
      locationId,
      locationHistory: [],
      losses: [],
      dispatches: [],
      applications: [],
      eventIds: [e.id],
    });
  },

  LotSown(state, e, config) {
    const lot = getLot(state, e.entityId);
    const allowed = stageConfig(config, lot.stage)?.next ?? [];
    if (!allowed.includes(CORE_STAGES.sown)) {
      fail('BR-LOT-03', `Solo se siembra un lote planificado; ${lot.folio} está en ${lot.stage}.`);
    }
    const p = e.payload;
    const trays = positiveInt(p, 'trays', 'BR-LOT-03', 'El número de charolas');
    const cavities = positiveInt(p, 'cavities', 'BR-LOT-03', 'Las cavidades por charola');
    const quantity = positiveInt(p, 'quantity', 'BR-LOT-03', 'La cantidad sembrada');
    if (quantity > trays * cavities) {
      fail(
        'BR-LOT-03',
        `La cantidad sembrada (${quantity}) supera las cavidades de sus charolas (${trays} × ${cavities} = ${trays * cavities}).`,
      );
    }
    const loc = requirePlantable(state, p.locationId);
    checkOperatedAt(e, config);
    const date = operationDate(e, config);
    if (lot.plannedAt && date < lot.plannedAt) {
      fail('BR-EVT-06', 'La siembra no puede ser anterior a la planificación.');
    }
    lot.stage = CORE_STAGES.sown;
    lot.trays = trays;
    lot.cavities = cavities;
    lot.initialQty = quantity;
    lot.currentQty = quantity;
    lot.sowingDate = date;
    lot.locationId = loc.id;
    lot.locationHistory = [{ locationId: loc.id, from: date, eventId: e.id }];
    linkEvent(lot, e.id);
  },

  LotStageChanged(state, e, config) {
    const lot = getLot(state, e.entityId);
    requireActive(lot);
    const to = str(e.payload, 'toStage', 'BR-LOT-04', 'la etapa destino');
    const current = stageConfig(config, lot.stage);
    if (!stageConfig(config, to)) fail('BR-LOT-04', `La etapa ${to} no está configurada.`);
    if (
      [CORE_STAGES.sown, CORE_STAGES.cancelled, CORE_STAGES.closed, CORE_STAGES.lost].includes(
        to as never,
      )
    ) {
      fail(
        'BR-LOT-04',
        `A ${to} se llega con su propia operación (siembra, cancelación, cierre o pérdida).`,
      );
    }
    if (!current?.next.includes(to)) {
      fail(
        'BR-LOT-04',
        `No se permite pasar de ${current?.label ?? lot.stage} a ${stageConfig(config, to)?.label}.`,
      );
    }
    requireSown(lot);
    checkOperatedAt(e, config, lot);
    lot.stage = to;
    linkEvent(lot, e.id);
  },

  LotTransferred(state, e, config) {
    const lot = getLot(state, e.entityId);
    requireActive(lot);
    requireSown(lot);
    const loc = requirePlantable(state, e.payload.toLocationId);
    checkOperatedAt(e, config, lot);
    const date = operationDate(e, config);
    if (locationAt(lot, date) === loc.id) fail('BR-LOT-11', `El lote ya está en ${loc.code}.`);
    lot.locationHistory.push({ locationId: loc.id, from: date, eventId: e.id });
    lot.locationHistory.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    lot.locationId = lot.locationHistory[lot.locationHistory.length - 1].locationId;
    linkEvent(lot, e.id);
  },

  LossRecorded(state, e, config) {
    const lot = getLot(state, e.entityId);
    requireActive(lot);
    requireSown(lot);
    const quantity = positiveInt(e.payload, 'quantity', 'BR-LOT-05', 'La cantidad perdida');
    const cause = str(e.payload, 'cause', 'BR-LOT-05', 'la causa');
    if (!config.lossCauses.includes(cause) && cause !== config.importLossCause) {
      fail('BR-LOT-05', `La causa "${cause}" no está en el catálogo del productor.`);
    }
    if (quantity > lot.currentQty) {
      fail(
        'BR-LOT-05',
        `La pérdida (${quantity}) supera las plántulas que quedan en ${lot.folio} (${lot.currentQty}).`,
      );
    }
    checkOperatedAt(e, config, lot);
    lot.currentQty -= quantity;
    lot.lostQty += quantity;
    lot.losses.push({
      eventId: e.id,
      quantity,
      cause,
      date: e.operatedAt ?? (cause === config.importLossCause ? null : operationDate(e, config)),
    });
    linkEvent(lot, e.id);
    settleIfEmpty(lot, operationDate(e, config));
  },

  LotCancelled(state, e, config) {
    const lot = getLot(state, e.entityId);
    if (
      lot.sowingDate !== null ||
      !(stageConfig(config, lot.stage)?.next ?? []).includes(CORE_STAGES.cancelled)
    ) {
      fail(
        'BR-LOT-09',
        `Solo se cancela un lote antes de sembrarlo; ${lot.folio} está en ${lot.stage}.`,
      );
    }
    str(e.payload, 'reason', 'BR-LOT-09', 'el motivo');
    checkOperatedAt(e, config);
    lot.stage = CORE_STAGES.cancelled;
    lot.endedAt = operationDate(e, config);
    linkEvent(lot, e.id);
  },

  LotClosed(state, e, config) {
    const lot = getLot(state, e.entityId);
    if (lot.stage !== CORE_STAGES.ready)
      fail('UC-ENT-02', `Solo se cierra un lote listo para venta.`);
    checkOperatedAt(e, config, lot);
    const remaining = lot.currentQty;
    let cause: string | null = null;
    if (remaining > 0) {
      cause = str(e.payload, 'cause', 'UC-ENT-02', 'la causa de la merma del sobrante');
      if (!config.lossCauses.includes(cause))
        fail('BR-LOT-05', `La causa "${cause}" no está en el catálogo.`);
    }
    const date = operationDate(e, config);
    if (remaining > 0 && cause !== null) {
      lot.lostQty += remaining;
      lot.currentQty = 0;
      lot.losses.push({ eventId: e.id, quantity: remaining, cause, date });
    }
    lot.stage = CORE_STAGES.closed;
    lot.endedAt = date;
    lot.hold = 'LIBRE';
    linkEvent(lot, e.id);
  },

  ApplicationRecorded(state, e, config) {
    const productId = str(e.payload, 'productId', 'BR-LAB-02', 'el producto');
    const product = state.products.get(productId);
    if (!product) fail('BR-LAB-02', 'El producto no está en el catálogo.');
    str(e.payload, 'dose', 'BR-LAB-02', 'la dosis');
    str(e.payload, 'reason', 'BR-LAB-02', 'el motivo');
    const targets = laborTargets(state, e, config);
    const date = operationDate(e, config);
    const until =
      product.safetyIntervalDays === null ? null : addDays(date, product.safetyIntervalDays);
    for (const lot of targets) {
      lot.applications.push({ eventId: e.id, productId, date, until });
      linkEvent(lot, e.id);
    }
  },

  FertilizationRecorded(state, e, config) {
    str(e.payload, 'product', 'UC-LAB-01', 'el producto');
    for (const lot of laborTargets(state, e, config)) linkEvent(lot, e.id);
  },

  InspectionRecorded(state, e, config) {
    const result = str(e.payload, 'result', 'UC-CAL-01', 'el resultado');
    if (!(result in config.inspectionResults))
      fail('UC-CAL-01', 'Resultado de inspección no válido.');
    for (const lot of laborTargets(state, e, config)) linkEvent(lot, e.id);
  },

  QuarantineStarted(state, e, config) {
    const lot = getLot(state, e.entityId);
    requireActive(lot);
    requireSown(lot);
    if (lot.hold === 'EN_CUARENTENA')
      fail('BR-CAL-01', `El lote ${lot.folio} ya está en cuarentena.`);
    const reason = str(e.payload, 'reason', 'BR-CAL-02', 'el motivo de la cuarentena');
    checkOperatedAt(e, config, lot);
    lot.hold = 'EN_CUARENTENA';
    lot.holdReason = reason;
    linkEvent(lot, e.id);
  },

  QuarantineReleased(state, e, config) {
    const lot = getLot(state, e.entityId);
    if (lot.hold !== 'EN_CUARENTENA')
      fail('BR-CAL-02', `El lote ${lot.folio} no está en cuarentena.`);
    checkOperatedAt(e, config, lot);
    lot.hold = 'LIBRE';
    lot.holdReason = null;
    linkEvent(lot, e.id);
  },

  DispatchRecorded(state, e, config) {
    const p = e.payload;
    const customer = str(p, 'customer', 'BR-ENT-02', 'el cliente');
    const order = str(p, 'order', 'BR-ENT-02', 'el pedido');
    const lines = p.lines;
    if (!Array.isArray(lines) || lines.length === 0)
      fail('BR-ENT-02', 'La entrega lleva al menos una línea.');
    if (state.dispatches.has(e.entityId)) fail('BR-ENT-02', 'La entrega ya existe.');
    checkOperatedAt(e, config);
    const date = operationDate(e, config);
    const seen = new Set<string>();
    const parsed = lines.map((raw: unknown) => {
      const line = (raw ?? {}) as Record<string, unknown>;
      const lot = getLot(state, String(line.lotId));
      if (seen.has(lot.id))
        fail('BR-ENT-02', `El lote ${lot.folio} aparece dos veces en la entrega.`);
      seen.add(lot.id);
      const quantity = positiveInt(line, 'quantity', 'BR-ENT-01', `La cantidad de ${lot.folio}`);
      if (lot.stage !== CORE_STAGES.ready) {
        fail(
          'BR-ENT-01',
          `El lote ${lot.folio} no está listo para venta (${stageConfig(config, lot.stage)?.label ?? lot.stage}).`,
        );
      }
      if (lot.hold === 'EN_CUARENTENA')
        fail('BR-CAL-01', `El lote ${lot.folio} está en cuarentena.`);
      const block = safetyBlock(state, lot, date);
      if (block) throw block;
      if (quantity > lot.currentQty) {
        fail(
          'BR-ENT-01',
          `La entrega de ${lot.folio} (${quantity}) supera lo que queda (${lot.currentQty}).`,
        );
      }
      if (lot.sowingDate && date < lot.sowingDate)
        fail('BR-EVT-06', 'La entrega es anterior a la siembra.');
      return { lot, quantity };
    });
    for (const { lot, quantity } of parsed) {
      lot.currentQty -= quantity;
      lot.dispatchedQty += quantity;
      lot.dispatches.push({
        eventId: e.id,
        dispatchId: e.entityId,
        customer,
        order,
        quantity,
        date,
      });
      linkEvent(lot, e.id);
      settleIfEmpty(lot, date);
    }
    state.dispatches.set(e.entityId, {
      id: e.entityId,
      eventId: e.id,
      customer,
      order,
      date,
      lines: parsed.map(({ lot, quantity }) => ({ lotId: lot.id, quantity })),
    });
  },

  EventVoided(state, e) {
    const targetId = str(e.payload, 'eventId', 'BR-EVT-03', 'el evento a anular');
    str(e.payload, 'reason', 'BR-EVT-03', 'el motivo de la anulación');
    const target = state.events.get(targetId);
    if (!target) fail('BR-EVT-03', 'El evento a anular no existe.');
    if (target.type === 'EventVoided') fail('BR-EVT-03', 'No se anula una anulación.');
    const st = state.status.get(targetId);
    if (st?.status === 'VOIDED' && st.voidedBy !== e.id)
      fail('BR-EVT-03', 'El evento ya está anulado.');
    // El efecto se aplica en la reconstrucción (rebuild): el evento anulado no se aplica.
  },
};

/** Valida y aplica un evento. Lanza DomainError sin cambiar el estado si no es válido. */
export function applyEvent(state: TraceState, event: TraceEvent, config: ProducerConfig): void {
  const handler = handlers[event.type];
  if (!handler) fail('EVENT-INVALID', `Tipo de evento desconocido: ${event.type}.`);
  handler(state, event, config);
}

/**
 * Reconstruye el estado desde cero en orden determinista (ADR-0013).
 * Un evento que ya no es válido queda en CONFLICTO, sin aplicarse (BR-EVT-05);
 * uno anulado queda ANULADO (ADR-0011).
 */
export function rebuild(events: TraceEvent[], config: ProducerConfig): TraceState {
  const state = emptyState(config);
  const sorted = [...events].sort(compareEvents);
  for (const e of sorted) state.events.set(e.id, e);

  const voidedBy = new Map<string, string>();
  for (const e of sorted) {
    if (e.type !== 'EventVoided') continue;
    const target = state.events.get(String(e.payload.eventId));
    if (target && target.type !== 'EventVoided' && !voidedBy.has(target.id))
      voidedBy.set(target.id, e.id);
  }

  for (const e of sorted) {
    state.order.push(e.id);
    const by = voidedBy.get(e.id);
    if (by) {
      state.status.set(e.id, { status: 'VOIDED', voidedBy: by });
      continue;
    }
    try {
      applyEvent(state, e, config);
      state.status.set(e.id, { status: 'APPLIED' });
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      state.status.set(e.id, { status: 'CONFLICT', code: err.code, reason: err.message });
    }
  }
  return state;
}
