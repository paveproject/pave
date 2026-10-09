import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NOTIFY_QUEUE } from './shared-notify.constants';
import { NotifyClient } from './shared-notify.client';

@Module({
  imports: [
    BullModule.registerQueue({
      name: NOTIFY_QUEUE,
    }),
  ],
  providers: [NotifyClient],
  exports: [NotifyClient],
})
export class NotifySharedModule {}
