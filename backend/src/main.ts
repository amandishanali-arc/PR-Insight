import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const frontendUrl = app.get(ConfigService).get<string>('FRONTEND_URL')?.trim();
  app.enableCors({
    origin: [
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
      ...(frontendUrl ? [new URL(frontendUrl).origin] : []),
    ],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
