import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, DemoOptions } from './app.module';
import { ProblemFilter } from './presentation/problem.filter';

export const PUBLIC_DIR = join(__dirname, '..', 'public');

export async function createApp(
  options: DemoOptions,
  logger = true,
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(options), {
    logger: logger ? ['log', 'warn', 'error'] : false,
  });
  app.useGlobalFilters(new ProblemFilter());
  app.disable('x-powered-by');
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.useStaticAssets(PUBLIC_DIR, { index: 'index.html' });
  return app;
}
