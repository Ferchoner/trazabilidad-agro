import { TraceService } from '../src/application/trace.service';
import { TraceState } from '../src/domain/types';
import { FixedClock } from '../src/platform/clock';
import { loadConfig } from '../src/platform/config';
import { EventStore } from '../src/platform/event-store';
import {
  buildProductorASeed,
  seedLocationId,
  seedLotId,
  seedMaterialId,
  seedProductId,
  seedVarietyId,
} from '../src/seed/productor-a';

export const config = loadConfig();
/** 19 de octubre de 2026, 12:00 en México. */
export const NOW = new Date('2026-10-19T18:00:00Z');

export function makeService(now = NOW) {
  const clock = new FixedClock(now);
  const store = new EventStore(':memory:');
  const service = new TraceService(store, config, clock, buildProductorASeed);
  return { service, store, clock };
}

export const ids = {
  lot: seedLotId,
  loc: seedLocationId,
  variety: seedVarietyId,
  material: seedMaterialId,
  product: seedProductId,
};

/** Estado comparable: dos estados iguales dan el mismo texto. */
export function snapshot(state: TraceState): string {
  const sortMap = <T>(m: Map<string, T>) => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify({
    lots: sortMap(state.lots),
    locations: sortMap(state.locations),
    dispatches: sortMap(state.dispatches),
    status: sortMap(state.status),
    lastFolio: state.lastFolioNumber,
  });
}
