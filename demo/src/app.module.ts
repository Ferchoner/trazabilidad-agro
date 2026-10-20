import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DynamicModule, Module } from '@nestjs/common';
import { TraceService } from './application/trace.service';
import { Clock, SystemClock } from './platform/clock';
import { loadConfig } from './platform/config';
import { EventStore } from './platform/event-store';
import { ApiController } from './presentation/api.controller';
import { buildProductorASeed } from './seed/productor-a';

export interface DemoOptions {
  /** Archivo SQLite; ':memory:' en pruebas. */
  databasePath: string;
  configPath?: string;
  clock?: Clock;
}

@Module({})
export class AppModule {
  static forRoot(options: DemoOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [ApiController],
      providers: [
        {
          provide: TraceService,
          useFactory: () => {
            const config = loadConfig(options.configPath);
            if (options.databasePath !== ':memory:')
              mkdirSync(dirname(options.databasePath), { recursive: true });
            const store = new EventStore(options.databasePath);
            return new TraceService(
              store,
              config,
              options.clock ?? new SystemClock(),
              buildProductorASeed,
            );
          },
        },
      ],
    };
  }
}
