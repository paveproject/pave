import { Module } from '@nestjs/common';
import { apnsProvider } from './apns.provider';
import { ApnsService } from './apns.service';

@Module({
  providers: [apnsProvider, ApnsService],
  exports: [ApnsService],
})
export class ApnsModule {}
