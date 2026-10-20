import { rebuild } from '../src/domain/projection';
import { inventoryByVariety, listLots, lossesReport, summary } from '../src/domain/queries';
import { loadConfig } from '../src/platform/config';
import { buildProductorASeed } from '../src/seed/productor-a';

const config = loadConfig();

describe('caso Productor A (datos ficticios)', () => {
  const events = buildProductorASeed(config);
  const state = rebuild(events, config);

  it('carga sin eventos en conflicto y con una anulación', () => {
    const statuses = [...state.status.values()];
    const conflicts = [...state.status.entries()].filter(([, s]) => s.status === 'CONFLICT');
    expect(conflicts.map(([id, s]) => `${state.events.get(id)?.type}: ${s.reason}`)).toEqual([]);
    expect(statuses.filter((s) => s.status === 'VOIDED')).toHaveLength(1);
  });

  it('cuadra lotes, plántulas, mermas y entregas', () => {
    const s = summary(state, config, '2026-10-19');
    expect(s.sown).toBe(10270);
    expect(s.lost).toBe(312);
    expect(s.dispatched).toBe(1900);
    expect(s.plantsInGreenhouse).toBe(10270 - 312 - 1900);
    expect(s.nextFolio).toBe('L-0822');
    expect(lossesReport(state).byCause[0]).toMatchObject({ cause: 'No pegó', quantity: 140 });
  });

  it('muestra los tres ejes del estado', () => {
    const lots = Object.fromEntries(listLots(state, config, '2026-10-19').map((l) => [l.folio, l]));
    expect(lots['L-0812']).toMatchObject({
      stage: 'CERRADO',
      commercial: 'VENDIDO',
      currentQty: 0,
    });
    expect(lots['L-0813']).toMatchObject({
      stage: 'LISTO_VENTA',
      commercial: 'PARCIALMENTE_VENDIDO',
      currentQty: 905,
      deliverable: true,
    });
    expect(lots['L-0814']).toMatchObject({
      stage: 'LISTO_VENTA',
      commercial: 'DISPONIBLE',
      deliverable: true,
    });
    expect(lots['L-0816']).toMatchObject({
      stage: 'ENRAIZADO',
      hold: 'EN_CUARENTENA',
      currentQty: 1420,
    });
    expect(lots['L-0816'].location?.code).toBe('INV2-A-M2');
    expect(lots['L-0817'].location?.code).toBe('INV2-A-M3');
    expect(lots['L-0817'].material).toBeNull();
    expect(lots['L-0818'].safety?.code).toBe('BR-LAB-03');
    expect(lots['L-0821']).toMatchObject({ stage: 'PLANIFICADO', plannedQty: 1400 });
  });

  it('separa el inventario entregable', () => {
    const inv = inventoryByVariety(state, config, '2026-10-19');
    const fest = inv.rows.find((r) => r.variety === 'Festival')!;
    expect(fest.deliverable).toBe(905);
    expect(fest.quarantine).toBe(1420);
    expect(fest.planned).toBe(1400);
  });
});
