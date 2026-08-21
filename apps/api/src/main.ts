import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

function serverPort(): number {
  const value = Number(process.env.PORT ?? 5000);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return value;
}

function trustedProxyHops(): number {
  const value = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (!Number.isSafeInteger(value) || value < 0 || value > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  }
  return value;
}

function corsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!configured?.length) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS is required in production');
    }
    return ['http://localhost:3000'];
  }

  return configured.map((origin) => {
    const parsed = new URL(origin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    return origin;
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const proxyHops = trustedProxyHops();
  if (proxyHops > 0) {
    app.set('trust proxy', proxyHops);
  }
  app.enableCors({
    credentials: true,
    origin: corsOrigins(),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await app.listen(serverPort(), '0.0.0.0');
}
void bootstrap();
