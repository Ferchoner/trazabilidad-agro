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
    expect(page.text).toContain('Productor A');
    const s = await request(app.getHttpServer()).get('/api/summary').expect(200);
    expect(s.body).toMatchObject({
      producer: 'Productor A (ficticio)',
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
      .post('/api/demo/reset')
      .set('x-demo-user', 'campo')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/demo/reset')
      .set('x-demo-user', 'dueno')
      .expect(200);
  });

  it('lista la bitácora de eventos', async () => {
    const res = await request(app.getHttpServer()).get('/api/events?limit=5').expect(200);
    expect(res.body.events).toHaveLength(5);
    expect(res.body.total).toBeGreaterThan(100);
  });
});
