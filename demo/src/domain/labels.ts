// Etiquetas e identificación física (ADR-0014, ADR-0023). El código de un lote es su folio y el
// de una ubicación, su código (INV1-A-M1); la pistola lectora los teclea tal cual.

import { LABEL_FORMATS } from './label-formats';
import { locationPath, stageLabel } from './queries';
import { ProducerConfig, TERMINAL_STAGES, TraceState } from './types';

/** Code 128 juego B: caracteres ASCII imprimibles. */
export const SCAN_CODE_RE = /^[\x20-\x7e]{1,40}$/;

export type ScanResult =
  | { kind: 'lot'; code: string; id: string; folio: string }
  | { kind: 'location'; code: string; id: string; level: string; path: string }
  | { kind: 'unknown'; code: string };

/** Qué es un código leído: lote, ubicación o desconocido. Sin efecto sobre el estado. */
export function resolveCode(state: TraceState, raw: string): ScanResult {
  const code = raw.trim().toUpperCase();
  const lotId = state.folios.get(code);
  if (lotId) return { kind: 'lot', code, id: lotId, folio: code };
  const loc = [...state.locations.values()].find((l) => l.code.toUpperCase() === code);
  if (loc)
    return {
      kind: 'location',
      code: loc.code,
      id: loc.id,
      level: loc.level,
      path: locationPath(state, loc.id) || loc.name,
    };
  return { kind: 'unknown', code };
}

function prints(state: TraceState, id: string, config: ProducerConfig) {
  return (state.labelPrints.get(id) ?? []).map((p) => ({
    ...p,
    user: config.users.find((u) => u.id === p.userId)?.name ?? p.userId,
  }));
}

/** Datos que lleva cada etiqueta, con sus impresiones anteriores. */
export function labelsData(state: TraceState, config: ProducerConfig) {
  const lots = [...state.lots.values()]
    .sort((a, b) => a.folio.localeCompare(b.folio))
    .map((l) => ({
      id: l.id,
      code: l.folio,
      folio: l.folio,
      variety: state.varieties.get(l.varietyId)?.name ?? '',
      stage: l.stage,
      stageLabel: stageLabel(config, l.stage),
      active: !TERMINAL_STAGES.includes(l.stage),
      sowingDate: l.sowingDate,
      quantity: l.sowingDate ? l.initialQty : l.plannedQty,
      trays: l.trays,
      location: l.locationId ? locationPath(state, l.locationId) : '',
      prints: prints(state, l.id, config),
    }));
  const locations = [...state.locations.values()]
    .filter((l) => l.level === 'TABLE' || l.level === 'SECTOR')
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((l) => ({
      id: l.id,
      code: l.code,
      level: l.level,
      levelLabel: config.levels[l.level],
      path: locationPath(state, l.id) || l.name,
      prints: prints(state, l.id, config),
    }));
  return { producer: config.producer.name, formats: LABEL_FORMATS, lots, locations };
}
