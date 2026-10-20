import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventStore } from '../src/platform/event-store';
import { buildProductorASeed } from '../src/seed/productor-a';
import { config } from './helpers';

describe('almacén de eventos en SQLite', () => {
  it('guarda en archivo, no permite editar eventos y conserva el orden', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'traza-')), 'demo.sqlite');
    const seed = buildProductorASeed(config);
    const store = new EventStore(file);
    store.append(seed);
    store.close();

    const db = new DatabaseSync(file);
    expect(() => db.exec("UPDATE events SET payload = '{}'")).toThrow(/inmutables/);
    db.close();

    const reopened = new EventStore(file);
    expect(reopened.all().map((e) => e.id)).toEqual(seed.map((e) => e.id));
    expect(reopened.get(seed[0].id)).toEqual(seed[0]);
    reopened.close();
  });

  it('un error a media transacción no guarda nada', () => {
    const store = new EventStore(':memory:');
    const [a] = buildProductorASeed(config);
    expect(() => store.append([a, a])).toThrow();
    expect(store.count()).toBe(0);
  });
});
