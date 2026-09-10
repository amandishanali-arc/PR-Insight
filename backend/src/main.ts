import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const frontendUrl = app
    .get(ConfigService)
    .get<string>('FRONTEND_URL')
    ?.trim();

  const allowedOrigins = [
    frontendUrl ? new URL(frontendUrl).origin : null,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (/^https:\/\/pr-insight-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`), false);
    },

    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();