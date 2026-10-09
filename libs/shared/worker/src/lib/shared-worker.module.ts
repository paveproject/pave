import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkerClient } from './shared-worker.client';
import { SEARCH_QUEUE } from './search/search.registry';

@Module({
  imports: [BullModule.registerQueue({ name: SEARCH_QUEUE })],
  providers: [WorkerClient],
  exports: [WorkerClient],
})
export class SharedWorkerModule {}
