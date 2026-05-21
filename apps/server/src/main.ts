import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

// Prisma uses BigInt for primary keys; JSON.stringify chokes on BigInt by
// default. Patching the prototype is the canonical NestJS workaround — see
// https://github.com/prisma/studio/issues/614. Must run before bootstrap so
// the first response can serialize.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

function corsOrigins(): boolean | string[] | RegExp {
  const raw = process.env.WEB_ORIGIN?.trim();
  if (!raw) {
    // dev convenience: allow any origin if not configured; warn loudly.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WEB_ORIGIN must be set in production (comma-separated)');
    }
    return true;
  }
  // Allow comma-separated list; "*" => any origin (still warn on startup).
  if (raw === '*') return true;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`RedMatrix server listening on :${port}`, 'Bootstrap');
}

bootstrap();
