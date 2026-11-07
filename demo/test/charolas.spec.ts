// Trazabilidad por charola y mapa de cavidades (ADR-0024, T-014).
import { randomUUID } from 'node:crypto';
import { CaptureInput } from '../src/application/trace.service';
import { DomainError } from '../src/domain/errors';
import { resolveCode } from '../src/domain/labels';
import { lotTrays, rebuild } from '../src/domain/projection';
import { inventoryByLocation, lotDetail, trayView } from '../src/domain/queries';
import { TraceState } from '../src/domain/types';
import { buildProductorASeed } from '../src/seed/productor-a';
import { config, ids, makeService, snapshot } from './helpers';

const lotEvent = (
  type: CaptureInput['type'],
  folio: string,
  payload: Record<string, unknown>,
): CaptureInput => ({
  id: randomUUID(),
  type,
  entityType: 'lot',
  entityId: ids.lot(folio),
  operatedAt: null,
  payload,
});

function expectRule(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba la regla ${code}`);
}

const tray = (state: TraceState, code: string) => state.trays.get(code)!;
const lot = (state: TraceState, folio: string) => state.lots.get(ids.lot(folio))!;

/** Mesas del inventario con sus lotes, como { 'INV2-B-M2': { 'L-0818': 1500 } }. */
function tables(state: TraceState) {
  const out: Record<string, Record<string, number>> = {};
  const walk = (nodes: ReturnType<typeof inventoryByLocation>) => {
    for (const n of nodes) {
      if (n.lots.length) out[n.code] = Object.fromEntries(n.lots.map((l) => [l.folio, l.quantity]));
      walk(n.children);
    }
  };
  walk(inventoryByLocation(state, config));
  return out;
}

describe('charolas del caso Productor A', () => {
  const state = rebuild(buildProductorASeed(config), config);

  it('carga 121 charolas que suman exactamente lo de cada lote, sin nada sin charola', () => {
    expect(state.trays.size).toBe(121);
    for (const l of state.lots.values()) {
      if (l.sowingDate === null) continue;
      const trays = lotTrays(state, l);
      expect(trays).toHaveLength(l.trays);
      expect(trays.reduce((a, t) => a + t.currentQty, 0)).toBe(l.currentQty);
      expect(trays.reduce((a, t) => a + t.lostQty, 0)).toBe(l.lostQty);
      expect(trays.reduce((a, t) => a + t.dispatchedQty, 0)).toBe(l.dispatchedQty);
      expect(l.unassignedLostQty).toBe(0);
      expect(l.unassignedDispatchedQty).toBe(0);
    }
  });

  it('crea las charolas llenas en orden y la última incompleta (BR-CHA-03)', () => {
    const trays = lotTrays(state, lot(state, 'L-0815'));
    expect(trays.map((t) => t.code).slice(0, 2)).toEqual(['L-0815-C01', 'L-0815-C02']);
    expect(trays[0]).toMatchObject({ cavities: 128, sownQty: 128 });
    expect(trays[14]).toMatchObject({ code: 'L-0815-C15', sownQty: 1900 - 14 * 128 });
  });

  it('deja L-0818 repartido en dos mesas y el inventario por mesa cuadra', () => {
    const l = lot(state, 'L-0818');
    const t = tables(state);
    expect(Object.keys(t).filter((code) => t[code]['L-0818'])).toEqual(['INV2-B-M2', 'INV2-B-M3']);
    expect(t['INV2-B-M2']['L-0818'] + t['INV2-B-M3']['L-0818']).toBe(l.currentQty);
    expect(tray(state, 'L-0818-C13').locationHistory).toHaveLength(2);
    const total = Object.values(t).reduce(
      (a, row) => a + Object.values(row).reduce((b, q) => b + q, 0),
      0,
    );
    expect(total).toBe(10270 - 312 - 1900);
  });

  it('marca en el mapa las pérdidas, la resiembra y la observación', () => {
    const c02 = trayView(state, tray(state, 'L-0815-C02'));
    expect(c02.cells.filter((c) => c.state === 'PERDIDA')).toHaveLength(10);
    expect(c02.cells.filter((c) => c.state === 'RESEMBRADA')).toHaveLength(10);
    expect(c02).toMatchObject({ currentQty: 118, reseedInQty: 10, unplacedQty: 0 });
    expect(tray(state, 'L-0815-C15')).toMatchObject({ reseedOutQty: 10, currentQty: 98 });
    const c05 = trayView(state, tray(state, 'L-0818-C05'));
    expect(c05.cells.filter((c) => c.state === 'OBSERVADA')).toHaveLength(3);
  });

  it('las entregas del caso salen de charolas escaneadas', () => {
    const p101 = [...state.dispatches.values()].find((d) => d.order === 'P-101')!;
    expect(p101.lines[0].trays.length).toBeGreaterThan(10);
    expect(lotTrays(state, lot(state, 'L-0812')).every((t) => t.currentQty === 0)).toBe(true);
  });
});

describe('operaciones por charola (ADR-0024)', () => {
  it('al sembrar crea las charolas del lote nuevo', () => {
    const { service } = makeService();
    const r = service.registerLot('jefe', {
      varietyId: ids.variety('Festival'),
      plantMaterialId: ids.material('festival-vn'),
      locationId: ids.loc('INV2-B-M1'),
      sow: { trays: 12, cavities: 72, quantity: 860 },
    });
    const trays = lotTrays(service.current, service.current.lots.get(r.lotId)!);
    expect(trays.map((t) => t.code)).toEqual(
      Array.from({ length: 12 }, (_, i) => `L-0822-C${String(i + 1).padStart(2, '0')}`),
    );
    expect(trays[11]).toMatchObject({ sownQty: 860 - 11 * 72, currentQty: 68 });
  });

  it('mueve solo las charolas elegidas y el lote queda en dos mesas', () => {
    const { service } = makeService();
    const codes = ['L-0814-C01', 'L-0814-C02', 'L-0814-C03'];
    service.submit('jefe', [
      lotEvent('LotTransferred', 'L-0814', { toLocationId: ids.loc('INV1-B-M3'), trays: codes }),
    ]);
    const s = service.current;
    const l = lot(s, 'L-0814');
    expect(codes.map((c) => tray(s, c).locationId)).toEqual(Array(3).fill(ids.loc('INV1-B-M3')));
    expect(l.locationId).toBe(ids.loc('INV1-B-M1'));
    const t = tables(s);
    expect(t['INV1-B-M3']['L-0814']).toBe(216);
    expect(t['INV1-B-M1']['L-0814']).toBe(l.currentQty - 216);
    const detail = lotDetail(s, l, service.config, service.today());
    expect(detail.locations.map((x) => x.code)).toEqual(['INV1-B-M1', 'INV1-B-M3']);
  });

  it('rechaza mover una charola de otro lote, repetida o que ya está en la mesa', () => {
    const { service } = makeService();
    const move = (trays: string[], to = 'INV1-B-M3') =>
      service.submit('jefe', [
        lotEvent('LotTransferred', 'L-0814', { toLocationId: ids.loc(to), trays }),
      ]);
    expectRule(() => move(['L-0815-C01']), 'BR-CHA-01');
    expectRule(() => move(['L-0814-C01', 'L-0814-C01']), 'BR-LOT-11');
    expectRule(() => move(['L-0814-C01'], 'INV1-B-M1'), 'BR-LOT-11');
  });

  it('registra la pérdida por charola y cavidad; una cavidad vacía no se pierde dos veces', () => {
    const { service } = makeService();
    const loss = (trays: unknown[], quantity = 3) =>
      service.submit('jefe', [
        lotEvent('LossRecorded', 'L-0814', { quantity, cause: 'Daño mecánico', trays }),
      ]);
    loss([{ code: 'L-0814-C01', quantity: 3, cavities: [1, 2, 3] }]);
    const t = tray(service.current, 'L-0814-C01');
    expect(t).toMatchObject({ currentQty: 69, lostQty: 3 });
    expect(t.marks[2]).toMatchObject({ mark: 'PERDIDA', note: 'Daño mecánico' });
    expectRule(() => loss([{ code: 'L-0814-C01', quantity: 1, cavities: [2] }], 1), 'BR-LOT-05');
    expectRule(() => loss([{ code: 'L-0814-C01', quantity: 2, cavities: [4] }], 2), 'BR-LOT-05');
    expectRule(() => loss([{ code: 'L-0814-C01', quantity: 2 }], 3), 'BR-LOT-05');
    expectRule(() => loss([{ code: 'L-0814-C18', quantity: 30 }], 30), 'BR-LOT-05');
  });

  it('una pérdida sin charola queda "sin charola asignada" y el inventario sigue cuadrando', () => {
    const { service } = makeService();
    service.submit('jefe', [
      lotEvent('LossRecorded', 'L-0814', { quantity: 20, cause: 'Daño mecánico' }),
    ]);
    const l = lot(service.current, 'L-0814');
    expect(l.unassignedLostQty).toBe(20);
    expect(tables(service.current)['INV1-B-M1']['L-0814']).toBe(l.currentQty);
  });

  it('resiembra dentro del lote mueve la plántula sin cambiar el total (BR-CHA-04)', () => {
    const { service } = makeService();
    service.submit('jefe', [
      lotEvent('LossRecorded', 'L-0814', {
        quantity: 2,
        cause: 'No pegó',
        trays: [{ code: 'L-0814-C01', quantity: 2, cavities: [10, 11] }],
      }),
    ]);
    const before = lot(service.current, 'L-0814').currentQty;
    const mark = (payload: Record<string, unknown>) =>
      service.submit('jefe', [lotEvent('CavitiesMarked', 'L-0814', payload)]);
    mark({ tray: 'L-0814-C01', cavities: [10, 11], mark: 'RESEMBRADA', fromTray: 'L-0814-C18' });
    const s = service.current;
    expect(lot(s, 'L-0814').currentQty).toBe(before);
    expect(tray(s, 'L-0814-C01')).toMatchObject({ currentQty: 72, reseedInQty: 2 });
    expect(tray(s, 'L-0814-C18')).toMatchObject({ currentQty: 24, reseedOutQty: 2 });
    expect(tray(s, 'L-0814-C01').marks[10]).toMatchObject({
      mark: 'RESEMBRADA',
      note: 'con plántula de L-0814-C18',
    });
    expectRule(
      () => mark({ tray: 'L-0814-C01', cavities: [5], mark: 'RESEMBRADA', fromTray: 'L-0814-C18' }),
      'BR-CHA-04',
    );
    expectRule(
      () =>
        mark({ tray: 'L-0814-C18', cavities: [70], mark: 'RESEMBRADA', fromTray: 'L-0814-C18' }),
      'BR-CHA-04',
    );
    expectRule(
      () =>
        mark({ tray: 'L-0814-C18', cavities: [70], mark: 'RESEMBRADA', fromTray: 'L-0815-C15' }),
      'BR-CHA-01',
    );
  });

  it('observa cavidades y quita la observación sin cambiar cantidades', () => {
    const { service } = makeService();
    const mark = (payload: Record<string, unknown>) =>
      service.submit('jefe', [lotEvent('CavitiesMarked', 'L-0814', payload)]);
    mark({ tray: 'L-0814-C02', cavities: [7, 8], mark: 'OBSERVADA', note: 'Hoja manchada' });
    expect(tray(service.current, 'L-0814-C02').marks[7]).toMatchObject({ mark: 'OBSERVADA' });
    mark({ tray: 'L-0814-C02', cavities: [7], mark: 'SANA' });
    expect(Object.keys(tray(service.current, 'L-0814-C02').marks)).toEqual(['8']);
    expect(tray(service.current, 'L-0814-C02').currentQty).toBe(72);
    expectRule(() => mark({ tray: 'L-0814-C02', cavities: [7], mark: 'SANA' }), 'UC-CAL-01');
    expectRule(() => mark({ tray: 'L-0814-C18', cavities: [60], mark: 'OBSERVADA' }), 'UC-CAL-01');
    expectRule(() => mark({ tray: 'L-0814-C02', cavities: [73], mark: 'OBSERVADA' }), 'BR-CHA-04');
    expect(() =>
      service.submit('campo', [
        lotEvent('CavitiesMarked', 'L-0814', {
          tray: 'L-0814-C02',
          cavities: [1],
          mark: 'OBSERVADA',
        }),
      ]),
    ).toThrow();
  });

  it('entrega por charolas escaneadas; la suma de charolas debe dar la línea (BR-ENT-02)', () => {
    const { service } = makeService();
    const dispatch = (trays: { code: string; quantity: number }[], quantity: number) =>
      service.submit('oficina', [
        {
          id: randomUUID(),
          type: 'DispatchRecorded',
          entityType: 'dispatch',
          entityId: randomUUID(),
          operatedAt: null,
          payload: {
            customer: 'Agrícola Los Pinos',
            order: 'P-103',
            lines: [{ lotId: ids.lot('L-0814'), quantity, trays }],
          },
        },
      ]);
    expectRule(() => dispatch([{ code: 'L-0814-C02', quantity: 72 }], 100), 'BR-ENT-02');
    dispatch(
      [
        { code: 'L-0814-C02', quantity: 72 },
        { code: 'L-0814-C03', quantity: 72 },
      ],
      144,
    );
    const s = service.current;
    expect(tray(s, 'L-0814-C02')).toMatchObject({ currentQty: 0, dispatchedQty: 72 });
    expect(lot(s, 'L-0814').unassignedDispatchedQty).toBe(0);
    const d = [...s.dispatches.values()].find((x) => x.order === 'P-103')!;
    expect(d.lines[0].trays).toEqual(['L-0814-C02', 'L-0814-C03']);
    expectRule(() => dispatch([{ code: 'L-0814-C02', quantity: 1 }], 1), 'BR-ENT-02');
  });

  it('una aplicación en una mesa alcanza al lote que tiene alguna charola ahí (ADR-0012, P-42)', () => {
    const { service } = makeService();
    service.submit('jefe', [
      lotEvent('LotTransferred', 'L-0814', {
        toLocationId: ids.loc('INV1-B-M3'),
        trays: ['L-0814-C01'],
      }),
    ]);
    const appId = randomUUID();
    service.submit('jefe', [
      {
        id: appId,
        type: 'ApplicationRecorded',
        entityType: 'location',
        entityId: ids.loc('INV1-B-M3'),
        operatedAt: null,
        payload: { productId: ids.product('abamectina'), dose: '0.5 mL/L', reason: 'Araña roja' },
      },
    ]);
    const s = service.current;
    expect(lot(s, 'L-0814').eventIds).toContain(appId);
    expect(lot(s, 'L-0815').eventIds).not.toContain(appId);
    const detail = lotDetail(s, lot(s, 'L-0814'), service.config, service.today());
    expect(detail.safety?.code).toBe('BR-LAB-03');
  });

  it('reconoce el código de charola al escanear', () => {
    const { service } = makeService();
    expect(resolveCode(service.current, ' l-0818-c05 ')).toEqual({
      kind: 'tray',
      code: 'L-0818-C05',
      lotId: ids.lot('L-0818'),
      folio: 'L-0818',
      index: 5,
      currentQty: 128,
      path: 'Inv 2 › Sector B › Tabla M2',
    });
  });

  it('imprime etiquetas de charola y rechaza la de otro lote', () => {
    const { service } = makeService();
    const print = (trays: string[]) =>
      service.submit('jefe', [
        lotEvent('LabelPrinted', 'L-0818', { format: 'R58', copies: 1, trays }),
      ]);
    print(['L-0818-C01', 'L-0818-C02']);
    expect(service.current.labelPrints.get('L-0818-C01')).toHaveLength(1);
    expect(service.current.labelPrints.get(ids.lot('L-0818'))).toBeUndefined();
    expectRule(() => print(['L-0815-C01']), 'BR-CHA-01');
  });

  it('reconstruir desde cero con operaciones por charola da el mismo estado', () => {
    const { service, store } = makeService();
    service.submit('jefe', [
      lotEvent('LotTransferred', 'L-0814', {
        toLocationId: ids.loc('INV1-B-M3'),
        trays: ['L-0814-C04', 'L-0814-C05'],
      }),
      lotEvent('LossRecorded', 'L-0814', {
        quantity: 2,
        cause: 'No pegó',
        trays: [{ code: 'L-0814-C04', quantity: 2, cavities: [1, 2] }],
      }),
      lotEvent('CavitiesMarked', 'L-0814', {
        tray: 'L-0814-C04',
        cavities: [1],
        mark: 'RESEMBRADA',
        fromTray: 'L-0814-C18',
      }),
    ]);
    const incremental = snapshot(service.current);
    expect(snapshot(service.rebuildFromStore())).toBe(incremental);
    const shuffled = [...store.all()].sort(() => Math.random() - 0.5);
    expect(snapshot(rebuild(shuffled, service.config))).toBe(incremental);
  });
});
