// Caso Productor A como eventos (datos ficticios, ADR-0017). Los hechos salen del guion del caso
// (`kit_consultor/caso_productor_A/interno/guion_caso.md`) y de su configuración inicial; las
// fechas de etapas, mermas y labores siguen sus reglas (enraizado ~3 semanas, listo 8 a 10).

import { buildEvent, EventDraft } from '../application/event-factory';
import { addDays } from '../domain/dates';
import { ProducerConfig, TraceEvent } from '../domain/types';
import { uuidFrom } from '../platform/ids';

const SEED = 'productor-a-2026';
const id = (key: string) => uuidFrom(`${SEED}:${key}`);
export const seedLocationId = (code: string) => id(`loc:${code}`);
export const seedLotId = (folio: string) => id(`lot:${folio}`);
export const seedVarietyId = (name: string) => id(`var:${name}`);
export const seedMaterialId = (key: string) => id(`mat:${key}`);
export const seedProductId = (key: string) => id(`prod:${key}`);

/** Hora local de México (UTC−6, sin horario de verano) a UTC ISO. */
function at(date: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCHours(h + 6, m, 0, 0);
  return d.toISOString();
}

/** Las hojas de campo se capturan en la oficina el lunes siguiente (guion: retraso hasta 7 días). */
function nextMonday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const add = (8 - d.getUTCDay()) % 7 || 7;
  return addDays(date, d.getUTCDay() === 1 ? 0 : add);
}

export function buildProductorASeed(config: ProducerConfig): TraceEvent[] {
  const drafts: EventDraft[] = [];
  let n = 0;
  const push = (d: Omit<EventDraft, 'id'>) => drafts.push({ ...d, id: id(`ev:${++n}`) });

  // ---------- catálogo y ubicaciones (1 de agosto, dueño en la PC de la oficina) ----------
  const catalog = (
    type: EventDraft['type'],
    entityType: EventDraft['entityType'],
    entityId: string,
    payload: Record<string, unknown>,
  ) =>
    push({
      type,
      entityType,
      entityId,
      occurredAt: at('2026-08-01', `08:${String(n % 60).padStart(2, '0')}`),
      operatedAt: null,
      userId: 'dueno',
      deviceId: 'pc-oficina',
      payload,
    });

  catalog('LocationCreated', 'location', seedLocationId('C1'), {
    code: 'C1',
    name: 'Centro de producción',
    level: 'CENTER',
    parentId: null,
  });
  for (const inv of ['1', '2']) {
    const invCode = `INV${inv}`;
    catalog('LocationCreated', 'location', seedLocationId(invCode), {
      code: invCode,
      name: `Inv ${inv}`,
      level: 'GREENHOUSE',
      parentId: seedLocationId('C1'),
    });
    for (const sec of ['A', 'B']) {
      const secCode = `${invCode}-${sec}`;
      catalog('LocationCreated', 'location', seedLocationId(secCode), {
        code: secCode,
        name: `Sector ${sec}`,
        level: 'SECTOR',
        parentId: seedLocationId(invCode),
      });
      for (const mesa of ['M1', 'M2', 'M3']) {
        const code = `${secCode}-${mesa}`;
        catalog('LocationCreated', 'location', seedLocationId(code), {
          code,
          name: `Tabla ${mesa}`,
          level: 'TABLE',
          parentId: seedLocationId(secCode),
        });
      }
    }
  }
  for (const name of ['Festival', 'Camino Real', 'San Andreas']) {
    catalog('VarietyCreated', 'variety', seedVarietyId(name), { name });
  }
  const materials = [
    {
      key: 'festival-vn',
      variety: 'Festival',
      origin: 'Estolón',
      supplier: 'Viveros Norte',
      document: 'Remisión en papel, sin lote del vivero',
    },
    {
      key: 'camino-vn',
      variety: 'Camino Real',
      origin: 'Estolón',
      supplier: 'Viveros Norte',
      document: 'Remisión en papel, sin lote del vivero',
    },
    {
      key: 'sanandreas-bp',
      variety: 'San Andreas',
      origin: 'In vitro',
      supplier: 'Lab BioPlant',
      document: 'Certificado fitosanitario (PDF por correo)',
    },
  ];
  for (const m of materials) {
    catalog('PlantMaterialRegistered', 'material', seedMaterialId(m.key), {
      varietyId: seedVarietyId(m.variety),
      origin: m.origin,
      supplier: m.supplier,
      document: m.document,
    });
  }
  const products = [
    {
      key: 'captan',
      name: 'Captan 50 (ficticio)',
      activeIngredient: 'captan',
      safetyIntervalDays: 14,
    },
    {
      key: 'abamectina',
      name: 'Abamectina 1.8 (ficticio)',
      activeIngredient: 'abamectina',
      safetyIntervalDays: 7,
    },
    {
      key: 'cuprico',
      name: 'Fungicida cúprico (ficticio)',
      activeIngredient: 'oxicloruro de cobre',
      safetyIntervalDays: 7,
    },
    {
      key: 'ajo',
      name: 'Extracto de ajo (ficticio)',
      activeIngredient: 'extracto de ajo',
      safetyIntervalDays: null,
    },
  ];
  for (const p of products) {
    catalog('ProductRegistered', 'product', seedProductId(p.key), {
      name: p.name,
      activeIngredient: p.activeIngredient,
      safetyIntervalDays: p.safetyIntervalDays,
    });
  }

  // ---------- siembras: lotes válidos del Excel 2026, capturados por la oficina ----------
  const lots = [
    {
      folio: 'L-0812',
      date: '2026-08-03',
      variety: 'Festival',
      loc: 'INV1-A-M1',
      trays: 20,
      cavities: 72,
      qty: 1400,
      material: 'festival-vn',
    },
    {
      folio: 'L-0813',
      date: '2026-08-03',
      variety: 'Festival',
      loc: 'INV1-A-M2',
      trays: 20,
      cavities: 72,
      qty: 1440,
      material: 'festival-vn',
    },
    {
      folio: 'L-0814',
      date: '2026-08-10',
      variety: 'Camino Real',
      loc: 'INV1-B-M1',
      trays: 18,
      cavities: 72,
      qty: 1250,
      material: 'camino-vn',
    },
    {
      folio: 'L-0815',
      date: '2026-08-17',
      variety: 'San Andreas',
      loc: 'INV1-B-M2',
      trays: 15,
      cavities: 128,
      qty: 1900,
      material: 'sanandreas-bp',
    },
    {
      folio: 'L-0816',
      date: '2026-08-24',
      variety: 'Festival',
      loc: 'INV2-A-M1',
      trays: 22,
      cavities: 72,
      qty: 1580,
      material: 'festival-vn',
    },
    // Sin mesa ni proveedor en el Excel: se ubica en el sector y el material queda PENDIENTE.
    {
      folio: 'L-0817',
      date: '2026-08-24',
      variety: 'Camino Real',
      loc: 'INV2-A',
      trays: 10,
      cavities: 72,
      qty: 700,
      material: null,
    },
    {
      folio: 'L-0818',
      date: '2026-09-07',
      variety: 'San Andreas',
      loc: 'INV2-B-M2',
      trays: 16,
      cavities: 128,
      qty: 2000,
      material: 'sanandreas-bp',
    },
  ];
  let minute = 0;
  for (const l of lots) {
    const lotId = seedLotId(l.folio);
    const occurredAt = at(l.date, `17:${String(minute++ * 2).padStart(2, '0')}`);
    push({
      type: 'LotPlanned',
      entityType: 'lot',
      entityId: lotId,
      occurredAt,
      operatedAt: l.date,
      userId: 'oficina',
      deviceId: 'pc-oficina',
      payload: {
        folio: l.folio,
        varietyId: seedVarietyId(l.variety),
        plantMaterialId: l.material ? seedMaterialId(l.material) : null,
        plannedQty: l.qty,
        locationId: seedLocationId(l.loc),
      },
    });
    push({
      type: 'LotSown',
      entityType: 'lot',
      entityId: lotId,
      occurredAt: at(l.date, `17:${String(minute++ * 2).padStart(2, '0')}`),
      operatedAt: l.date,
      userId: 'oficina',
      deviceId: 'pc-oficina',
      locationId: seedLocationId(l.loc),
      payload: {
        trays: l.trays,
        cavities: l.cavities,
        quantity: l.qty,
        locationId: seedLocationId(l.loc),
      },
    });
  }

  // ---------- fertirriego semanal por sector (hoja de campo, capturada el lunes) ----------
  const sectorStart: Record<string, string> = {
    'INV1-A': '2026-08-05',
    'INV1-B': '2026-08-12',
    'INV2-A': '2026-08-26',
    'INV2-B': '2026-09-09',
  };
  for (let day = '2026-08-05'; day <= '2026-10-14'; day = addDays(day, 7)) {
    let i = 0;
    for (const [sector, start] of Object.entries(sectorStart)) {
      if (day < start) continue;
      push({
        type: 'FertilizationRecorded',
        entityType: 'location',
        entityId: seedLocationId(sector),
        occurredAt: at(nextMonday(day), `18:${String(10 + i++).padStart(2, '0')}`),
        operatedAt: day,
        userId: 'oficina',
        deviceId: 'pc-oficina',
        locationId: seedLocationId(sector),
        payload: { product: 'Fertirriego Triple 19 (ficticio)', dose: '1 g/L' },
      });
    }
  }

  // ---------- operaciones del jefe (teléfono), del dueño y de la oficina ----------
  const jefe = (
    date: string,
    hhmm: string,
    d: Pick<EventDraft, 'type' | 'entityType' | 'entityId' | 'payload'> & { locationId?: string },
  ) =>
    push({
      ...d,
      occurredAt: at(date, hhmm),
      operatedAt: date,
      userId: 'jefe',
      deviceId: 'tel-jefe',
    });
  const dueno = (
    date: string,
    hhmm: string,
    d: Pick<EventDraft, 'type' | 'entityType' | 'entityId' | 'payload'>,
  ) =>
    push({
      ...d,
      occurredAt: at(date, hhmm),
      operatedAt: date,
      userId: 'dueno',
      deviceId: 'pc-oficina',
    });
  const oficina = (
    date: string,
    hhmm: string,
    d: Pick<EventDraft, 'type' | 'entityType' | 'entityId' | 'payload'>,
  ) =>
    push({
      ...d,
      occurredAt: at(date, hhmm),
      operatedAt: date,
      userId: 'oficina',
      deviceId: 'pc-oficina',
    });
  /** Pérdida de la hoja de campo: la oficina la captura el lunes siguiente con la fecha real. */
  const loss = (date: string, folio: string, quantity: number, cause: string) =>
    push({
      type: 'LossRecorded',
      entityType: 'lot',
      entityId: seedLotId(folio),
      occurredAt: at(nextMonday(date), '18:40'),
      operatedAt: date,
      userId: 'oficina',
      deviceId: 'pc-oficina',
      payload: { quantity, cause },
    });
  const stage = (
    date: string,
    folio: string,
    toStage: string,
    criterion: string,
    who: 'jefe' | 'dueno' = 'jefe',
  ) =>
    (who === 'jefe' ? jefe : dueno)(date, who === 'jefe' ? '10:00' : '12:00', {
      type: 'LotStageChanged',
      entityType: 'lot',
      entityId: seedLotId(folio),
      payload: { toStage, criterion },
    });
  const enraizado = 'Raíz formada, unas 3 semanas';

  loss('2026-08-14', 'L-0812', 35, 'No pegó');
  stage('2026-08-24', 'L-0812', 'ENRAIZADO', enraizado);
  stage('2026-08-24', 'L-0813', 'ENRAIZADO', enraizado);
  stage('2026-08-31', 'L-0814', 'ENRAIZADO', enraizado);
  jefe('2026-08-31', '11:00', {
    type: 'LotTransferred',
    entityType: 'lot',
    entityId: seedLotId('L-0817'),
    payload: { toLocationId: seedLocationId('INV2-A-M3'), note: 'Se confirma la mesa' },
  });
  loss('2026-09-02', 'L-0815', 60, 'No pegó');
  loss('2026-09-03', 'L-0814', 12, 'Daño mecánico');
  loss('2026-09-04', 'L-0817', 5, 'No pegó');
  stage('2026-09-07', 'L-0815', 'ENRAIZADO', enraizado);
  jefe('2026-09-10', '09:00', {
    type: 'ApplicationRecorded',
    entityType: 'location',
    entityId: seedLocationId('INV1-A'),
    locationId: seedLocationId('INV1-A'),
    payload: {
      productId: seedProductId('captan'),
      dose: '2.5 g/L',
      reason: 'Preventivo, recomendado por el agrónomo',
    },
  });
  stage('2026-09-14', 'L-0816', 'ENRAIZADO', enraizado);
  stage('2026-09-14', 'L-0817', 'ENRAIZADO', enraizado);
  loss('2026-09-18', 'L-0818', 40, 'No pegó');
  // Un movimiento capturado en el lote equivocado: se anula y se captura el correcto (ADR-0011).
  const wrongTransferN = n + 1;
  jefe('2026-09-21', '10:00', {
    type: 'LotTransferred',
    entityType: 'lot',
    entityId: seedLotId('L-0817'),
    payload: { toLocationId: seedLocationId('INV2-A-M2'), note: 'Hacer espacio en Inv 2' },
  });
  jefe('2026-09-21', '10:10', {
    type: 'LotTransferred',
    entityType: 'lot',
    entityId: seedLotId('L-0816'),
    payload: { toLocationId: seedLocationId('INV2-A-M2'), note: 'Hacer espacio en Inv 2' },
  });
  dueno('2026-09-21', '18:00', {
    type: 'EventVoided',
    entityType: 'event',
    entityId: id(`ev:${wrongTransferN}`),
    payload: {
      eventId: id(`ev:${wrongTransferN}`),
      reason: 'Se capturó en el lote equivocado; el que se movió fue L-0816',
    },
  });
  loss('2026-09-21', 'L-0816', 40, 'Daño mecánico');
  stage('2026-09-28', 'L-0818', 'ENRAIZADO', enraizado);
  jefe('2026-09-28', '09:00', {
    type: 'ApplicationRecorded',
    entityType: 'location',
    entityId: seedLocationId('INV1-A'),
    locationId: seedLocationId('INV1-A'),
    payload: {
      productId: seedProductId('abamectina'),
      dose: '0.5 mL/L',
      reason: 'Araña roja, recomendado por el agrónomo',
    },
  });
  dueno('2026-09-30', '11:50', {
    type: 'InspectionRecorded',
    entityType: 'lot',
    entityId: seedLotId('L-0812'),
    payload: { result: 'OK', note: 'Altura y raíz conformes' },
  });
  stage('2026-09-30', 'L-0812', 'LISTO_VENTA', 'Recorrido del dueño', 'dueno');
  stage('2026-10-01', 'L-0813', 'LISTO_VENTA', 'Recorrido del dueño', 'dueno');
  oficina('2026-10-06', '09:00', {
    type: 'DispatchRecorded',
    entityType: 'dispatch',
    entityId: id('dispatch:P-101'),
    payload: {
      customer: 'Rancho El Sauz',
      order: 'P-101',
      lines: [{ lotId: seedLotId('L-0812'), quantity: 900 }],
    },
  });
  jefe('2026-10-08', '11:00', {
    type: 'InspectionRecorded',
    entityType: 'lot',
    entityId: seedLotId('L-0816'),
    payload: { result: 'ENFERMEDAD', note: 'Manchas compatibles con antracnosis en 5 charolas' },
  });
  jefe('2026-10-08', '11:15', {
    type: 'QuarantineStarted',
    entityType: 'lot',
    entityId: seedLotId('L-0816'),
    payload: { reason: 'Sospecha de antracnosis' },
  });
  jefe('2026-10-09', '09:00', {
    type: 'ApplicationRecorded',
    entityType: 'lot',
    entityId: seedLotId('L-0816'),
    payload: { productId: seedProductId('cuprico'), dose: '2 g/L', reason: 'Antracnosis' },
  });
  loss('2026-10-09', 'L-0816', 120, 'Plaga o enfermedad');
  oficina('2026-10-13', '09:00', {
    type: 'DispatchRecorded',
    entityType: 'dispatch',
    entityId: id('dispatch:P-102'),
    payload: {
      customer: 'Agrícola Los Pinos',
      order: 'P-102',
      lines: [
        { lotId: seedLotId('L-0812'), quantity: 465 },
        { lotId: seedLotId('L-0813'), quantity: 535 },
      ],
    },
  });
  stage('2026-10-14', 'L-0814', 'LISTO_VENTA', 'Recorrido del dueño', 'dueno');
  jefe('2026-10-15', '09:00', {
    type: 'ApplicationRecorded',
    entityType: 'location',
    entityId: seedLocationId('INV2-B'),
    locationId: seedLocationId('INV2-B'),
    payload: {
      productId: seedProductId('abamectina'),
      dose: '0.5 mL/L',
      reason: 'Araña roja, recomendado por el agrónomo',
    },
  });
  jefe('2026-10-16', '10:00', {
    type: 'LotPlanned',
    entityType: 'lot',
    entityId: seedLotId('L-0821'),
    payload: {
      folio: 'L-0821',
      varietyId: seedVarietyId('Festival'),
      plantMaterialId: seedMaterialId('festival-vn'),
      plannedQty: 1400,
      locationId: seedLocationId('INV1-A-M1'),
    },
  });

  // Secuencia por dispositivo creciente con la hora (ADR-0013).
  const sorted = [...drafts].sort((a, b) =>
    a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0,
  );
  const seq = new Map<string, number>();
  return sorted.map((d) => {
    const deviceSeq = (seq.get(d.deviceId) ?? 0) + 1;
    seq.set(d.deviceId, deviceSeq);
    return buildEvent(d, {
      recordedAt: d.occurredAt,
      nodeOrigin: config.producer.nodeCode,
      deviceSeq,
    });
  });
}
