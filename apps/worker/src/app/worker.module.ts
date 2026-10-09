import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SharedWorkerModule } from '@shared/worker';
import { env } from '../env';
import { DrizzleModule } from '../common/modules/drizzle.module';
import { SearchModule } from './search/search.module';
import { EnvModule, workerSchema } from '@libs/env';

@Module({
  imports: [
    EnvModule.forRoot(workerSchema),
    BullModule.forRoot({
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
      },
    }),
    DrizzleModule,
    SharedWorkerModule,
    SearchModule,
  ],
})
export class WorkerModule {}
