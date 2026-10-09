import { Module } from '@nestjs/common';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { BullModule } from '@nestjs/bullmq';
import { NotifySharedModule } from '@shared/notify';
import { env } from '../env';
import { NotifyProcessor } from './notify.processor';
import { NotifyService } from './notify.service';
import * as path from 'path';
import { FcmModule } from './fcm/fcm.module';
import { ApnsModule } from './apns/apns.module';
import { DrizzleModule } from '../common/modules/drizzle.module';
import { defaultSupportedLocale, SupportedLocale } from '@libs/i18n';
import { EnvModule, notifySchema } from '@libs/env';

@Module({
  imports: [
    EnvModule.forRoot(notifySchema),
    I18nModule.forRoot({
      fallbackLanguage: defaultSupportedLocale,
      fallbacks: {
        'en-*': 'en-US' as SupportedLocale,
        'fr-*': 'fr-FR' as SupportedLocale,
      },
      loaderOptions: {
        path: path.join(__dirname, '/assets/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),
    BullModule.forRoot({
      connection: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
      },
    }),
    DrizzleModule,
    FcmModule,
    ApnsModule,
    NotifySharedModule,
  ],
  controllers: [],
  providers: [NotifyService, NotifyProcessor],
})
export class NotifyModule {}
