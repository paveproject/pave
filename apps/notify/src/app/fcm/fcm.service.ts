import { Inject, Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FCM_CLIENT } from './fcm.provider';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor(@Inject(FCM_CLIENT) private readonly messaging: admin.messaging.Messaging) {}

  async sendMulticast(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!tokens.length) return [];

    const clickActionUrl = data?.url ?? undefined;

    try {
      const response = await this.messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
        android: { priority: 'high' },
        webpush: clickActionUrl
          ? {
              fcmOptions: {
                link: clickActionUrl,
              },
            }
          : undefined,
      });

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) failedTokens.push(tokens[idx]);
        });
        this.logger.warn(`Failed to send to ${response.failureCount} FCM tokens`);
        return failedTokens;
      }

      return [];
    } catch (error) {
      this.logger.error(`FCM Error: ${error.message}`);
      return tokens;
    }
  }
}
