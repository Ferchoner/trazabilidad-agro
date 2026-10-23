// Consultas de solo lectura sobre el estado (Traceability Queries, DOMAIN_MODEL.md).

import { localDate } from './dates';
import { LABEL_FORMATS } from './label-formats';
import { operationDate, safetyBlock } from './projection';
import {
  Commercial,
  CORE_STAGES,
  Lot,
  ProducerConfig,
  TERMINAL_STAGES,
  TraceEvent,
  TraceState,
} from './types';

export function stageLabel(config: ProducerConfig, code: string): string {
  return config.stages.find((s) => s.code === code)?.label ?? code;
}

/** Situación comercial calculada, nunca asignada a mano (ADR-0009). */
export function commercialStatus(lot: Lot): Commercial | null {
  const sold =
    lot.stage === CORE_STAGES.ready || (lot.stage === CORE_STAGES.closed && lot.dispatchedQty > 0);
  if (!sold) return null;
  if (lot.dispatchedQty === 0) return 'DISPONIBLE';
  return lot.currentQty > 0 ? 'PARCIALMENTE_VENDIDO' : 'VENDIDO';
}

export function locationPath(state: TraceState, id: string | null): string {
  const names: string[] = [];
  let cur = id;
  while (cur) {
    const loc = state.locations.get(cur);
    if (!loc) break;
    if (loc.level !== 'CENTER') names.unshift(loc.name);
    cur = loc.parentId;
  }
  return names.join(' › ');
}

function userName(config: ProducerConfig, id: string): string {
  return config.users.find((u) => u.id === id)?.name ?? id;
}

export function lotView(state: TraceState, lot: Lot, config: ProducerConfig, today: string) {
  const variety = state.varieties.get(lot.varietyId);
  const material = lot.plantMaterialId ? state.materials.get(lot.plantMaterialId) : undefined;
  const active = !TERMINAL_STAGES.includes(lot.stage);
  const block = active && lot.sowingDate ? safetyBlock(state, lot, today) : null;
  const deliverable =
    lot.stage === CORE_STAGES.ready && lot.hold === 'LIBRE' && block === null && lot.currentQty > 0;
  const loc = lot.locationId ? state.locations.get(lot.locationId) : undefined;
  return {
    id: lot.id,
    folio: lot.folio,
    variety: variety?.name ?? '',
    varietyId: lot.varietyId,
    material: material
      ? {
          id: material.id,
          origin: material.origin,
          supplier: material.supplier,
          document: material.document,
        }
      : null,
    stage: lot.stage,
    stageLabel: stageLabel(config, lot.stage),
    hold: lot.hold,
    holdReason: lot.holdReason,
    commercial: commercialStatus(lot),
    plannedQty: lot.plannedQty,
    initialQty: lot.initialQty,
    currentQty: lot.currentQty,
    lostQty: lot.lostQty,
    dispatchedQty: lot.dispatchedQty,
    trays: lot.trays,
    cavities: lot.cavities,
    plannedAt: lot.plannedAt,
    sowingDate: lot.sowingDate,
    endedAt: lot.endedAt,
    location: loc
      ? { id: loc.id, code: loc.code, level: loc.level, path: locationPath(state, loc.id) }
      : null,
    safety: block ? { code: block.code, message: block.message } : null,
    deliverable,
    nextStages: (config.stages.find((s) => s.code === lot.stage)?.next ?? []).filter(
      (s) =>
        ![CORE_STAGES.sown, CORE_STAGES.cancelled, CORE_STAGES.closed, CORE_STAGES.lost].includes(
          s as never,
        ),
    ),
  };
}

export function listLots(state: TraceState, config: ProducerConfig, today: string) {
  return [...state.lots.values()]
    .sort((a, b) => (a.folio < b.folio ? -1 : 1))
    .map((l) => lotView(state, l, config, today));
}

/** Descripción en español de un evento, para historias y bitácora. */
export function describeEvent(state: TraceState, e: TraceEvent, config: ProducerConfig): string {
  const p = e.payload as Record<string, any>;
  const lot = state.lots.get(e.entityId);
  const folio = lot?.folio ?? '';
  const loc = (id: unknown) => {
    const l = typeof id === 'string' ? state.locations.get(id) : undefined;
    return l ? locationPath(state, l.id) || l.name : '';
  };
  const target = e.entityType === 'location' ? loc(e.entityId) : folio;
  switch (e.type) {
    case 'LocationCreated':
      return `Ubicación ${p.code} (${config.levels[p.level as keyof typeof config.levels] ?? p.level}): ${p.name}`;
    case 'VarietyCreated':
      return `Variedad ${p.name}`;
    case 'PlantMaterialRegistered':
      return `Material vegetal: ${p.origin}${p.supplier ? `, ${p.supplier}` : ', proveedor PENDIENTE'}`;
    case 'ProductRegistered':
      return `Producto ${p.name} (${p.activeIngredient}), intervalo ${p.safetyIntervalDays === null ? 'PENDIENTE' : `${p.safetyIntervalDays} días`}`;
    case 'LotPlanned':
      return `Lote ${p.folio} planificado: ${state.varieties.get(p.varietyId)?.name ?? ''}, ${p.plannedQty} plántulas`;
    case 'LotSown':
      return `Siembra de ${folio}: ${p.quantity} plántulas en ${p.trays} charolas de ${p.cavities}, ${loc(p.locationId)}`;
    case 'LotStageChanged':
      return `${folio} pasa a ${stageLabel(config, p.toStage)}${p.criterion ? ` (${p.criterion})` : ''}`;
    case 'LotTransferred':
      return `${folio} se mueve a ${loc(p.toLocationId)}`;
    case 'LossRecorded':
      return `Pérdida en ${folio}: ${p.quantity} plántulas, causa ${p.cause}`;
    case 'LotCancelled':
      return `${folio} cancelado: ${p.reason}`;
    case 'LotClosed':
      return `${folio} cerrado${p.cause ? `; sobrante como merma (${p.cause})` : ''}`;
    case 'ApplicationRecorded': {
      const prod = state.products.get(p.productId);
      return `Aplicación en ${target}: ${prod?.name ?? ''}, ${p.dose}, ${p.reason}${prod && prod.safetyIntervalDays === null ? ' (sin intervalo de seguridad)' : ''}`;
    }
    case 'FertilizationRecorded':
      return `Fertirriego en ${target}: ${p.product}${p.dose ? `, ${p.dose}` : ''}`;
    case 'InspectionRecorded':
      return `Inspección en ${target}: ${config.inspectionResults[p.result] ?? p.result}${p.note ? `, ${p.note}` : ''}`;
    case 'QuarantineStarted':
      return `${folio} en cuarentena: ${p.reason}`;
    case 'QuarantineReleased':
      return `${folio} liberado de cuarentena${p.note ? `: ${p.note}` : ''}`;
    case 'DispatchRecorded': {
      const lines = (p.lines as { lotId: string; quantity: number }[])
        .map((l) => `${state.lots.get(l.lotId)?.folio ?? '?'} (${l.quantity})`)
        .join(', ');
      return `Entrega a ${p.customer}, pedido ${p.order}: ${lines}`;
    }
    case 'LabelPrinted': {
      const fmt = LABEL_FORMATS.find((f) => f.code === p.format)?.label ?? p.format;
      const prev = (state.labelPrints.get(e.entityId) ?? []).find((x) => x.eventId === e.id);
      const copies = p.copies === 1 ? '1 copia' : `${p.copies} copias`;
      return `Etiqueta de ${target} ${prev?.reprint ? 'reimpresa' : 'impresa'} (${fmt}, ${copies})`;
    }
    case 'EventVoided': {
      const t = state.events.get(p.eventId);
      return `Anulación de "${t ? describeEvent(state, t, config) : p.eventId}": ${p.reason}`;
    }
    default:
      return e.type;
  }
}

export function eventView(state: TraceState, e: TraceEvent, config: ProducerConfig) {
  const st = state.status.get(e.id);
  return {
    id: e.id,
    type: e.type,
    entityType: e.entityType,
    entityId: e.entityId,
    description: describeEvent(state, e, config),
    operationDate:
      e.operatedAt ??
      (e.type === 'LossRecorded' && e.payload.cause === config.importLossCause
        ? null
        : operationDate(e, config)),
    occurredAt: e.occurredAt,
    recordedAt: e.recordedAt,
    user: userName(config, e.userId),
    deviceId: e.deviceId,
    status: st?.status ?? 'APPLIED',
    code: st?.code ?? null,
    reason: st?.reason ?? null,
    voidedBy: st?.voidedBy ?? null,
  };
}

export function lotDetail(state: TraceState, lot: Lot, config: ProducerConfig, today: string) {
  const ids = new Set(lot.eventIds);
  // Eventos del lote que no se aplicaron (anulados o en conflicto) también son su historia.
  for (const e of state.events.values()) {
    if (e.entityId === lot.id) ids.add(e.id);
    if (
      e.type === 'DispatchRecorded' &&
      (e.payload.lines as { lotId: string }[]).some((l) => l.lotId === lot.id)
    ) {
      ids.add(e.id);
    }
    if (e.type === 'EventVoided') {
      const t = state.events.get(String(e.payload.eventId));
      if (t && (t.entityId === lot.id || lot.eventIds.includes(t.id))) ids.add(e.id);
    }
  }
  const history = state.order
    .filter((id) => ids.has(id))
    .map((id) => {
      const e = state.events.get(id)!;
      return { ...eventView(state, e, config), direct: e.entityType !== 'location' };
    });
  return {
    ...lotView(state, lot, config, today),
    locationHistory: lot.locationHistory.map((h) => ({
      from: h.from,
      path: locationPath(state, h.locationId),
    })),
    losses: lot.losses,
    dispatches: lot.dispatches,
    applications: lot.applications.map((a) => {
      const p = state.products.get(a.productId);
      return { ...a, product: p?.name ?? '', activeIngredient: p?.activeIngredient ?? '' };
    }),
    history,
  };
}

/** Disponibilidad por variedad y etapa, separando lo bloqueado (UC-REP-01). */
export function inventoryByVariety(state: TraceState, config: ProducerConfig, today: string) {
  const stages = config.stages
    .filter((s) => !TERMINAL_STAGES.includes(s.code) && s.code !== CORE_STAGES.planned)
    .map((s) => ({ code: s.code, label: s.label }));
  const rows = [...state.varieties.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => {
      const byStage: Record<string, number> = Object.fromEntries(stages.map((s) => [s.code, 0]));
      let deliverable = 0;
      let quarantine = 0;
      let safety = 0;
      let planned = 0;
      for (const lot of state.lots.values()) {
        if (lot.varietyId !== v.id || TERMINAL_STAGES.includes(lot.stage)) continue;
        if (lot.stage === CORE_STAGES.planned) {
          planned += lot.plannedQty;
          continue;
        }
        byStage[lot.stage] = (byStage[lot.stage] ?? 0) + lot.currentQty;
        if (lot.hold === 'EN_CUARENTENA') quarantine += lot.currentQty;
        if (lot.stage === CORE_STAGES.ready) {
          const view = lotView(state, lot, config, today);
          if (view.deliverable) deliverable += lot.currentQty;
          else if (lot.hold === 'LIBRE') safety += lot.currentQty;
        }
      }
      const total = Object.values(byStage).reduce((a, b) => a + b, 0);
      return {
        variety: v.name,
        byStage,
        total,
        deliverable,
        quarantine,
        safetyBlocked: safety,
        planned,
      };
    });
  return { stages, rows };
}

interface LocationNode {
  id: string;
  code: string;
  name: string;
  level: string;
  levelLabel: string;
  quantity: number;
  lots: { id: string; folio: string; quantity: number; stage: string; hold: string }[];
  children: LocationNode[];
}

/** Inventario por ubicación: invernadero, sector y mesa, con los lotes activos. */
export function inventoryByLocation(state: TraceState, config: ProducerConfig): LocationNode[] {
  const build = (id: string): LocationNode => {
    const loc = state.locations.get(id)!;
    const children = [...state.locations.values()]
      .filter((l) => l.parentId === id)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((l) => build(l.id));
    const lots = [...state.lots.values()]
      .filter(
        (l) => l.locationId === id && !TERMINAL_STAGES.includes(l.stage) && l.sowingDate !== null,
      )
      .sort((a, b) => a.folio.localeCompare(b.folio))
      .map((l) => ({
        id: l.id,
        folio: l.folio,
        quantity: l.currentQty,
        stage: stageLabel(config, l.stage),
        hold: l.hold,
      }));
    const quantity =
      lots.reduce((a, l) => a + l.quantity, 0) + children.reduce((a, c) => a + c.quantity, 0);
    return {
      id,
      code: loc.code,
      name: loc.name,
      level: loc.level,
      levelLabel: config.levels[loc.level],
      quantity,
      lots,
      children,
    };
  };
  return [...state.locations.values()].filter((l) => l.parentId === null).map((l) => build(l.id));
}

/** Mermas por causa y por lote (UC-REP-02). */
export function lossesReport(state: TraceState) {
  const byCause = new Map<string, { cause: string; quantity: number; lots: Set<string> }>();
  let sown = 0;
  let lost = 0;
  let dispatched = 0;
  for (const lot of state.lots.values()) {
    sown += lot.initialQty;
    lost += lot.lostQty;
    dispatched += lot.dispatchedQty;
    for (const l of lot.losses) {
      const row = byCause.get(l.cause) ?? { cause: l.cause, quantity: 0, lots: new Set<string>() };
      row.quantity += l.quantity;
      row.lots.add(lot.folio);
      byCause.set(l.cause, row);
    }
  }
  return {
    totals: { sown, lost, dispatched, inGreenhouse: sown - lost - dispatched },
    byCause: [...byCause.values()]
      .sort((a, b) => b.quantity - a.quantity)
      .map((r) => ({ cause: r.cause, quantity: r.quantity, lots: [...r.lots].sort() })),
    byLot: [...state.lots.values()]
      .filter((l) => l.initialQty > 0)
      .sort((a, b) => a.folio.localeCompare(b.folio))
      .map((l) => ({
        folio: l.folio,
        id: l.id,
        initialQty: l.initialQty,
        lostQty: l.lostQty,
        percent: Math.round((l.lostQty / l.initialQty) * 1000) / 10,
      })),
  };
}

export function dispatchesReport(state: TraceState) {
  return [...state.dispatches.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((d) => ({
      ...d,
      status: state.status.get(d.eventId)?.status ?? 'APPLIED',
      lines: d.lines.map((l) => ({ ...l, folio: state.lots.get(l.lotId)?.folio ?? '' })),
      total: d.lines.reduce((a, l) => a + l.quantity, 0),
    }));
}

export function summary(state: TraceState, config: ProducerConfig, today: string) {
  const lots = [...state.lots.values()];
  const active = lots.filter((l) => !TERMINAL_STAGES.includes(l.stage));
  const views = active.map((l) => lotView(state, l, config, today));
  const conflicts = [...state.status.values()].filter((s) => s.status === 'CONFLICT').length;
  return {
    producer: config.producer.name,
    today,
    activeLots: active.length,
    plantsInGreenhouse: active.reduce((a, l) => a + l.currentQty, 0),
    readyDeliverable: views.filter((v) => v.deliverable).reduce((a, v) => a + v.currentQty, 0),
    inQuarantine: active.filter((l) => l.hold === 'EN_CUARENTENA').length,
    inSafetyInterval: views.filter((v) => v.safety !== null).length,
    lost: lots.reduce((a, l) => a + l.lostQty, 0),
    dispatched: lots.reduce((a, l) => a + l.dispatchedQty, 0),
    sown: lots.reduce((a, l) => a + l.initialQty, 0),
    events: state.events.size,
    conflicts,
    nextFolio: nextFolio(state, config),
  };
}

/** Siguiente folio corto (ADR-0010). Un solo nodo y un solo bloque en el demo (P-11). */
export function nextFolio(state: TraceState, config: ProducerConfig): string {
  const n = String(state.lastFolioNumber + 1).padStart(config.producer.folioDigits, '0');
  return `${config.producer.folioPrefix}-${n}`;
}

export function todayFor(config: ProducerConfig, now: Date): string {
  return localDate(now, config.producer.timeZone);
}
