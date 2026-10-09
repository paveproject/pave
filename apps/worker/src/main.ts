import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './app/worker.module';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule);
  await app.listen(env.PORT);
  Logger.log(`Worker service is running on: http://localhost:${env.PORT}/`);
}

bootstrap();
