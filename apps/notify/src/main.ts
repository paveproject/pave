import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NotifyModule } from './app/notify.module';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create(NotifyModule);
  await app.listen(env.PORT);
  Logger.log(`Notify service is running on: http://localhost:${env.PORT}/`);
}

bootstrap();
