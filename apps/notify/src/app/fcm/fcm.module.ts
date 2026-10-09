import { Module } from '@nestjs/common';
import { fcmProvider } from './fcm.provider';
import { FcmService } from './fcm.service';

@Module({
  providers: [fcmProvider, FcmService],
  exports: [FcmService],
})
export class FcmModule {}
