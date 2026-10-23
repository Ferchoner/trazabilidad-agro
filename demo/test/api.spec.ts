import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/bootstrap';
import { FixedClock } from '../src/platform/clock';
import { ids, NOW } from './helpers';

describe('API del demo', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createApp({ databasePath: ':memory:', clock: new FixedClock(NOW) }, false);
    await app.init();
  });
  afterEach(() => app.close());

  it('sirve la interfaz y los datos del caso', async () => {
    const page = await request(app.getHttpServer()).get('/').expect(200);
    expect(page.text).toContain('Trazabilidad de plántula');
    const s = await request(app.getHttpServer()).get('/api/summary').expect(200);
    expect(s.body).toMatchObject({
      producer: 'Productor A',
      nextFolio: 'L-0822',
      conflicts: 0,
    });
    const lots = await request(app.getHttpServer()).get('/api/lots').expect(200);
    expect(lots.body).toHaveLength(8);
    const detail = await request(app.getHttpServer()).get('/api/lots/L-0816').expect(200);
    expect(detail.body).toMatchObject({ hold: 'EN_CUARENTENA', stageLabel: 'Enraizado' });
    expect(detail.body.history.length).toBeGreaterThan(5);
    const inv = await request(app.getHttpServer()).get('/api/inventory').expect(200);
    expect(inv.body.byLocation[0].quantity).toBe(10270 - 312 - 1900);
    const check = await request(app.getHttpServer()).get('/api/import-check').expect(200);
    expect(check.body.totals).toMatchObject({ rows: 11, errors: 4 });
  });

  it('registra un lote con el usuario elegido', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/lots')
      .set('x-demo-user', 'jefe')
      .send({
        varietyId: ids.variety('Festival'),
        plantMaterialId: ids.material('festival-vn'),
        locationId: ids.loc('INV2-B-M1'),
        sow: { trays: 12, cavities: 72, quantity: 860 },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      folio: 'L-0822',
      lot: { stageLabel: 'Sembrado', currentQty: 860 },
    });
  });

  it('responde Problem Details con la regla incumplida', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/lots')
      .set('x-demo-user', 'jefe')
      .send({
        varietyId: ids.variety('Festival'),
        locationId: ids.loc('INV2-B-M1'),
        sow: { trays: 1, cavities: 72, quantity: 100 },
      })
      .expect(422);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 422, code: 'BR-LOT-03' });
  });

  it('rechaza sin usuario o sin permiso', async () => {
    await request(app.getHttpServer())
      .post('/api/events')
      .send({ type: 'LossRecorded' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/reset')
      .set('x-demo-user', 'campo')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/admin/reset')
      .set('x-demo-user', 'dueno')
      .expect(200);
  });

  it('no muestra avisos de demo en la interfaz (ADR-0022)', async () => {
    const page = await request(app.getHttpServer()).get('/').expect(200);
    expect(page.text).not.toMatch(/demo|ficticio/i);
    const cfg = await request(app.getHttpServer()).get('/api/config').expect(200);
    expect(JSON.stringify(cfg.body)).not.toMatch(/ficticio/i);
    const catalog = await request(app.getHttpServer()).get('/api/catalog').expect(200);
    expect(JSON.stringify(catalog.body)).not.toMatch(/ficticio/i);
  });

  it('resuelve códigos escaneados sin cambiar nada (ADR-0014)', async () => {
    const before = await request(app.getHttpServer()).get('/api/summary').expect(200);
    const lot = await request(app.getHttpServer()).get('/api/scan/l-0813').expect(200);
    expect(lot.body).toMatchObject({ kind: 'lot', folio: 'L-0813', id: ids.lot('L-0813') });
    const table = await request(app.getHttpServer()).get('/api/scan/INV1-A-M1').expect(200);
    expect(table.body).toMatchObject({
      kind: 'location',
      level: 'TABLE',
      id: ids.loc('INV1-A-M1'),
    });
    const unknown = await request(app.getHttpServer()).get('/api/scan/XYZ-123').expect(200);
    expect(unknown.body).toMatchObject({ kind: 'unknown' });
    await request(app.getHttpServer())
      .get(`/api/scan/${encodeURIComponent('L-08\u00f1')}`)
      .expect(400);
    const after = await request(app.getHttpServer()).get('/api/summary').expect(200);
    expect(after.body.events).toBe(before.body.events);
  });

  it('registra la impresión de etiquetas por rol (ADR-0023)', async () => {
    const labels = await request(app.getHttpServer()).get('/api/labels').expect(200);
    expect(labels.body.formats.map((f: { code: string }) => f.code)).toEqual([
      'T100X50',
      'R80',
      'R58',
      'CARTA',
    ]);
    expect(
      labels.body.locations.filter((l: { level: string }) => l.level === 'TABLE'),
    ).toHaveLength(12);
    const print = (user: string) =>
      request(app.getHttpServer())
        .post('/api/events')
        .set('x-demo-user', user)
        .send({
          type: 'LabelPrinted',
          entityType: 'lot',
          entityId: ids.lot('L-0813'),
          payload: { format: 'R58', copies: 2 },
        });
    await print('campo').expect(403);
    await print('oficina').expect(201);
    const after = await request(app.getHttpServer()).get('/api/labels').expect(200);
    const l0813 = after.body.lots.find((l: { folio: string }) => l.folio === 'L-0813');
    expect(l0813.prints).toMatchObject([
      { format: 'R58', copies: 2, reprint: false, user: 'Encargada de oficina' },
    ]);
  });

  it('lista la bitácora de eventos', async () => {
    const res = await request(app.getHttpServer()).get('/api/events?limit=5').expect(200);
    expect(res.body.events).toHaveLength(5);
    expect(res.body.total).toBeGreaterThan(100);
  });
});
