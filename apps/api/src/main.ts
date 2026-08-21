import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function serverPort(): number {
  const value = Number(process.env.PORT ?? 5000);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
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
  const app = await NestFactory.create(AppModule);
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
