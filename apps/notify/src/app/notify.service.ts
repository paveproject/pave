import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from '../env';
import { pushProviderEnum } from '@libs/db/schemas';
import { FcmService } from './fcm/fcm.service';
import { ApnsService } from './apns/apns.service';
import { PushNotificationPayload } from '@libs/notify-types';

@Injectable()
export class NotifyService {
  private readonly resend: Resend;
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    private readonly fcmService: FcmService,
    private readonly apnsService: ApnsService,
  ) {
    this.resend = new Resend(env.RESEND_API_KEY);
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      const data = await this.resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
      });

      if (data.error) {
        this.logger.error(`Resend error: ${data.error.message}`);
        throw new Error(data.error.message);
      }
      return data;
    } catch (error) {
      this.logger.error(`❌ Failed to send email: ${error}`);
      throw error;
    }
  }

  async sendPushNotifications(
    devices: { provider: (typeof pushProviderEnum.enumValues)[number]; token: string }[],
    payload: { title: string; body: string; data: PushNotificationPayload },
  ) {
    const fcmTokens = devices.filter((d) => d.provider === 'fcm').map((d) => d.token);
    const apnsTokens = devices.filter((d) => d.provider === 'apns').map((d) => d.token);

    const [failedFcm, failedApns] = await Promise.all([
      this.fcmService.sendMulticast(fcmTokens, payload.title, payload.body, payload.data),
      this.apnsService.sendToDevices(apnsTokens, payload.title, payload.body, payload.data),
    ]);

    const allFailedTokens = [...failedFcm, ...failedApns];

    if (allFailedTokens.length > 0) {
      this.logger.debug(`Total dead tokens to clean up: ${allFailedTokens.length}`);
    }
  }
}
