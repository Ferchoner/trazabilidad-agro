import { randomUUID } from 'node:crypto';
import {
  CaptureInput,
  IdempotencyConflict,
  PermissionError,
} from '../src/application/trace.service';
import { DomainError } from '../src/domain/errors';
import { rebuild } from '../src/domain/projection';
import { lotDetail } from '../src/domain/queries';
import { ids, makeService, snapshot } from './helpers';

const lotEvent = (
  type: CaptureInput['type'],
  folio: string,
  payload: Record<string, unknown>,
  operatedAt: string | null = null,
): CaptureInput => ({
  id: randomUUID(),
  type,
  entityType: 'lot',
  entityId: ids.lot(folio),
  operatedAt,
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

const dispatch = (
  lines: { folio: string; quantity: number }[],
  operatedAt: string | null = null,
): CaptureInput => ({
  id: randomUUID(),
  type: 'DispatchRecorded',
  entityType: 'dispatch',
  entityId: randomUUID(),
  operatedAt,
  payload: {
    customer: 'Agrícola Los Pinos',
    order: 'P-103',
    lines: lines.map((l) => ({ lotId: ids.lot(l.folio), quantity: l.quantity })),
  },
});

describe('registro de lotes', () => {
  it('asigna el siguiente folio corto después del último del Excel (ADR-0010)', () => {
    const { service } = makeService();
    const r = service.registerLot('jefe', {
      varietyId: ids.variety('Festival'),
      plantMaterialId: ids.material('festival-vn'),
      locationId: ids.loc('INV2-B-M1'),
      operatedAt: '2026-10-19',
      sow: { trays: 12, cavities: 72, quantity: 860 },
    });
    expect(r.folio).toBe('L-0822');
    const lot = service.current.lots.get(r.lotId)!;
    expect(lot).toMatchObject({ stage: 'SEMBRADO', currentQty: 860, sowingDate: '2026-10-19' });
  });

  it('rechaza más plántulas que cavidades (BR-LOT-03) sin guardar nada', () => {
    const { service, store } = makeService();
    const before = store.count();
    expectRule(
      () =>
        service.registerLot('jefe', {
          varietyId: ids.variety('Camino Real'),
          locationId: ids.loc('INV1-A-M3'),
          sow: { trays: 8, cavities: 72, quantity: 640 },
        }),
      'BR-LOT-03',
    );
    expect(store.count()).toBe(before);
    expect(service.current.folios.has('L-0822')).toBe(false);
  });

  it('rechaza un folio repetido (BR-LOT-01)', () => {
    const { service } = makeService();
    expectRule(
      () =>
        service.registerLot('jefe', {
          folio: 'L-0816',
          varietyId: ids.variety('Festival'),
          locationId: ids.loc('INV2-A-M2'),
          plannedQty: 700,
        }),
      'BR-LOT-01',
    );
  });

  it('no deja registrar lotes a un rol sin permiso (BR-USR-02)', () => {
    const { service } = makeService();
    expect(() =>
      service.registerLot('campo', {
        varietyId: ids.variety('Festival'),
        locationId: ids.loc('INV2-B-M1'),
        plannedQty: 500,
      }),
    ).toThrow(PermissionError);
  });

  it('pide la fecha de operación no futura ni anterior a la siembra (BR-EVT-06)', () => {
    const { service } = makeService();
    expectRule(
      () =>
        service.submit('jefe', [
          lotEvent('LossRecorded', 'L-0815', { quantity: 5, cause: 'No pegó' }, '2026-10-25'),
        ]),
      'BR-EVT-06',
    );
    expectRule(
      () =>
        service.submit('jefe', [
          lotEvent('LossRecorded', 'L-0815', { quantity: 5, cause: 'No pegó' }, '2026-08-01'),
        ]),
      'BR-EVT-06',
    );
    service.submit('oficina', [
      lotEvent('LossRecorded', 'L-0815', { quantity: 5, cause: 'No pegó' }, '2026-10-14'),
    ]);
    expect(service.current.lots.get(ids.lot('L-0815'))!.losses.at(-1)).toMatchObject({
      date: '2026-10-14',
      quantity: 5,
    });
  });
});

describe('estado del lote (ADR-0009)', () => {
  it('solo avanza por transiciones configuradas (BR-LOT-04)', () => {
    const { service } = makeService();
    expectRule(
      () =>
        service.submit('dueno', [lotEvent('LotStageChanged', 'L-0821', { toStage: 'ENRAIZADO' })]),
      'BR-LOT-04',
    );
    expectRule(
      () =>
        service.submit('dueno', [lotEvent('LotStageChanged', 'L-0813', { toStage: 'ENRAIZADO' })]),
      'BR-LOT-04',
    );
  });

  it('solo el dueño marca Listo (configuración del Productor A)', () => {
    const { service } = makeService();
    expect(() =>
      service.submit('jefe', [lotEvent('LotStageChanged', 'L-0815', { toStage: 'LISTO_VENTA' })]),
    ).toThrow(PermissionError);
    service.submit('dueno', [lotEvent('LotStageChanged', 'L-0815', { toStage: 'LISTO_VENTA' })]);
    expect(service.current.lots.get(ids.lot('L-0815'))!.stage).toBe('LISTO_VENTA');
  });

  it('la pérdida tiene causa y no supera lo que queda; en 0 sin entregas queda Perdido (BR-LOT-05, 06)', () => {
    const { service } = makeService();
    expectRule(
      () =>
        service.submit('jefe', [
          lotEvent('LossRecorded', 'L-0817', { quantity: 696, cause: 'No pegó' }),
        ]),
      'BR-LOT-05',
    );
    expectRule(
      () =>
        service.submit('jefe', [
          lotEvent('LossRecorded', 'L-0817', { quantity: 5, cause: 'Granizo' }),
        ]),
      'BR-LOT-05',
    );
    service.submit('jefe', [
      lotEvent('LossRecorded', 'L-0817', { quantity: 695, cause: 'Plaga o enfermedad' }),
    ]);
    expect(service.current.lots.get(ids.lot('L-0817'))).toMatchObject({
      stage: 'PERDIDO',
      currentQty: 0,
      lostQty: 700,
    });
  });

  it('la cuarentena es independiente de la etapa y bloquea la entrega (BR-CAL-01)', () => {
    const { service } = makeService();
    service.submit('jefe', [
      lotEvent('QuarantineStarted', 'L-0813', { reason: 'Trips en bordes' }),
    ]);
    const lot = service.current.lots.get(ids.lot('L-0813'))!;
    expect(lot).toMatchObject({ stage: 'LISTO_VENTA', hold: 'EN_CUARENTENA' });
    expectRule(
      () => service.submit('oficina', [dispatch([{ folio: 'L-0813', quantity: 100 }])]),
      'BR-CAL-01',
    );
    expect(() => service.submit('jefe', [lotEvent('QuarantineReleased', 'L-0813', {})])).toThrow(
      PermissionError,
    );
    service.submit('dueno', [lotEvent('QuarantineReleased', 'L-0813', { note: 'Sin síntomas' })]);
    service.submit('oficina', [dispatch([{ folio: 'L-0813', quantity: 100 }])]);
    expect(service.current.lots.get(ids.lot('L-0813'))!.currentQty).toBe(805);
  });

  it('cancela solo antes de sembrar (BR-LOT-09)', () => {
    const { service } = makeService();
    expectRule(
      () => service.submit('jefe', [lotEvent('LotCancelled', 'L-0813', { reason: 'x' })]),
      'BR-LOT-09',
    );
    service.submit('jefe', [
      lotEvent('LotCancelled', 'L-0821', { reason: 'Se pospone la siembra' }),
    ]);
    expect(service.current.lots.get(ids.lot('L-0821'))!.stage).toBe('CANCELADO');
  });

  it('cierra un lote listo y cuenta el sobrante como merma con causa (UC-ENT-02)', () => {
    const { service } = makeService();
    expectRule(() => service.submit('oficina', [lotEvent('LotClosed', 'L-0813', {})]), 'UC-ENT-02');
    service.submit('oficina', [lotEvent('LotClosed', 'L-0813', { cause: 'Descarte de calidad' })]);
    expect(service.current.lots.get(ids.lot('L-0813'))).toMatchObject({
      stage: 'CERRADO',
      currentQty: 0,
      lostQty: 905,
    });
  });
});

describe('labores e intervalo de seguridad', () => {
  it('una aplicación sobre un sector se liga a los lotes presentes (ADR-0012)', () => {
    const { service } = makeService();
    const id = randomUUID();
    service.submit('jefe', [
      {
        id,
        type: 'ApplicationRecorded',
        entityType: 'location',
        entityId: ids.loc('INV2-A'),
        operatedAt: null,
        payload: { productId: ids.product('captan'), dose: '2.5 g/L', reason: 'Preventivo' },
      },
    ]);
    const s = service.current;
    expect(s.lots.get(ids.lot('L-0816'))!.eventIds).toContain(id);
    expect(s.lots.get(ids.lot('L-0817'))!.eventIds).toContain(id);
    expect(s.lots.get(ids.lot('L-0818'))!.eventIds).not.toContain(id);
  });

  it('no entrega antes de cumplir el intervalo (BR-LAB-03)', () => {
    const { service } = makeService();
    service.submit('jefe', [
      {
        id: randomUUID(),
        type: 'ApplicationRecorded',
        entityType: 'location',
        entityId: ids.loc('INV1-B'),
        operatedAt: '2026-10-17',
        payload: { productId: ids.product('captan'), dose: '2.5 g/L', reason: 'Preventivo' },
      },
    ]);
    expectRule(
      () => service.submit('oficina', [dispatch([{ folio: 'L-0814', quantity: 100 }])]),
      'BR-LAB-03',
    );
  });

  it('una aplicación sin intervalo se registra, pero la entrega queda PENDIENTE (BR-LAB-02, P-19)', () => {
    const { service } = makeService();
    service.submit('jefe', [
      lotEvent('ApplicationRecorded', 'L-0814', {
        productId: ids.product('ajo'),
        dose: '5 mL/L',
        reason: 'Prueba',
      }),
    ]);
    expectRule(
      () => service.submit('oficina', [dispatch([{ folio: 'L-0814', quantity: 100 }])]),
      'P-19',
    );
  });
});

describe('entregas (BR-ENT-01, 02)', () => {
  it('rechaza la entrega completa si una línea no cumple', () => {
    const { service } = makeService();
    expectRule(
      () =>
        service.submit('oficina', [
          dispatch([
            { folio: 'L-0813', quantity: 500 },
            { folio: 'L-0815', quantity: 100 },
          ]),
        ]),
      'BR-ENT-01',
    );
    expect(service.current.lots.get(ids.lot('L-0813'))!.currentQty).toBe(905);
  });

  it('no entrega más de lo que queda', () => {
    const { service } = makeService();
    expectRule(
      () => service.submit('oficina', [dispatch([{ folio: 'L-0814', quantity: 1239 }])]),
      'BR-ENT-01',
    );
  });

  it('entrega varios lotes en un pedido y cierra el lote que llega a 0', () => {
    const { service } = makeService();
    service.submit('oficina', [
      dispatch([
        { folio: 'L-0813', quantity: 905 },
        { folio: 'L-0814', quantity: 600 },
      ]),
    ]);
    const s = service.current;
    expect(s.lots.get(ids.lot('L-0813'))!.stage).toBe('CERRADO');
    expect(s.lots.get(ids.lot('L-0814'))!.currentQty).toBe(638);
  });
});

describe('eventos inmutables (ADR-0005, ADR-0011, ADR-0013)', () => {
  it('reenviar el mismo evento no tiene efecto; el mismo UUID con otro contenido se rechaza (BR-EVT-02)', () => {
    const { service, store } = makeService();
    const e = {
      ...lotEvent('LossRecorded', 'L-0815', { quantity: 10, cause: 'No pegó' }),
      occurredAt: '2026-10-19T17:00:00.000Z',
    };
    expect(service.submit('jefe', [e]).events[0].duplicate).toBe(false);
    const count = store.count();
    expect(service.submit('jefe', [e]).events[0].duplicate).toBe(true);
    expect(store.count()).toBe(count);
    expect(service.current.lots.get(ids.lot('L-0815'))!.lostQty).toBe(70);
    expect(() =>
      service.submit('jefe', [{ ...e, payload: { quantity: 11, cause: 'No pegó' } }]),
    ).toThrow(IdempotencyConflict);
  });

  it('anular reconstruye el estado; lo que deja de ser válido queda en CONFLICTO visible (BR-EVT-03, 05)', () => {
    const { service } = makeService();
    const stageEvent = [...service.current.events.values()].find(
      (e) =>
        e.type === 'LotStageChanged' &&
        e.entityId === ids.lot('L-0814') &&
        e.payload.toStage === 'LISTO_VENTA',
    )!;
    const d = dispatch([{ folio: 'L-0814', quantity: 200 }]);
    service.submit('oficina', [d]);
    service.submit('dueno', [
      {
        id: randomUUID(),
        type: 'EventVoided',
        entityType: 'event',
        entityId: stageEvent.id,
        operatedAt: null,
        payload: { eventId: stageEvent.id, reason: 'Se marcó listo por error' },
      },
    ]);
    const s = service.current;
    expect(s.status.get(stageEvent.id)?.status).toBe('VOIDED');
    expect(s.status.get(d.id!)).toMatchObject({ status: 'CONFLICT', code: 'BR-ENT-01' });
    expect(s.lots.get(ids.lot('L-0814'))).toMatchObject({ stage: 'ENRAIZADO', currentQty: 1238 });
    const detail = lotDetail(s, s.lots.get(ids.lot('L-0814'))!, service.config, service.today());
    expect(detail.history.some((h) => h.status === 'CONFLICT')).toBe(true);
    expectRule(
      () =>
        service.submit('dueno', [
          {
            id: randomUUID(),
            type: 'EventVoided',
            entityType: 'event',
            entityId: stageEvent.id,
            operatedAt: null,
            payload: { eventId: stageEvent.id, reason: 'otra vez' },
          },
        ]),
      'BR-EVT-03',
    );
  });

  it('solo el administrador anula', () => {
    const { service } = makeService();
    const any = [...service.current.events.values()].find((e) => e.type === 'LossRecorded')!;
    expect(() =>
      service.submit('jefe', [
        {
          id: randomUUID(),
          type: 'EventVoided',
          entityType: 'event',
          entityId: any.id,
          operatedAt: null,
          payload: { eventId: any.id, reason: 'x' },
        },
      ]),
    ).toThrow(PermissionError);
  });

  it('reconstruir desde cero da exactamente el mismo estado, en cualquier orden de llegada', () => {
    const { service, store } = makeService();
    service.registerLot('jefe', {
      varietyId: ids.variety('Festival'),
      plantMaterialId: ids.material('festival-vn'),
      locationId: ids.loc('INV2-B-M1'),
      sow: { trays: 12, cavities: 72, quantity: 860 },
    });
    service.submit('oficina', [dispatch([{ folio: 'L-0814', quantity: 300 }])]);
    service.submit('jefe', [
      lotEvent('LossRecorded', 'L-0818', { quantity: 20, cause: 'Daño mecánico' }, '2026-10-16'),
    ]);
    const incremental = snapshot(service.current);
    expect(snapshot(service.rebuildFromStore())).toBe(incremental);
    const shuffled = [...store.all()].sort(() => Math.random() - 0.5);
    expect(snapshot(rebuild(shuffled, service.config))).toBe(incremental);
  });

  it('regresa a los datos iniciales solo con el administrador', () => {
    const { service } = makeService();
    const initial = snapshot(service.current);
    service.submit('jefe', [
      lotEvent('LossRecorded', 'L-0818', { quantity: 20, cause: 'Daño mecánico' }),
    ]);
    expect(() => service.reset('jefe')).toThrow(PermissionError);
    service.reset('dueno');
    expect(snapshot(service.current)).toBe(initial);
  });
});
