import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NOTIFY_QUEUE, NotifyJob } from '@shared/notify';
import { NotifyService } from './notify.service';
import { I18nService } from 'nestjs-i18n';
import { render } from '@react-email/render';
import { VerificationEmail } from '../templates/auth/verification-email';
import { DeleteAccount } from '../templates/auth/delete-account';
import { DRIZZLE_SERVICE, DrizzleService } from '../common/modules/drizzle.module';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { authSessions, pushToken, user } from '@libs/db/schemas';
import { defaultSupportedLocale } from '@libs/i18n';

@Processor(NOTIFY_QUEUE)
export class NotifyProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyProcessor.name);

  constructor(
    private readonly notifyService: NotifyService,
    private readonly i18n: I18nService,
    @Inject(DRIZZLE_SERVICE) private readonly db: DrizzleService,
  ) {
    super();
  }

  async process(job: NotifyJob) {
    this.logger.log(`📩 Job received: ${job.name}`);

    try {
      switch (job.name) {
        case 'auth:verification-email': {
          const { email, url, lang } = job.data;
          await this.notifyService.sendEmail(
            email,
            this.i18n.t('auth.verify_email.subject', { lang }),
            await render(
              VerificationEmail({
                url,
                dictionary: {
                  title: this.i18n.t('auth.verify_email.title', { lang }),
                  text: this.i18n.t('auth.verify_email.text', { lang }),
                  button: this.i18n.t('auth.verify_email.button', { lang }),
                },
              }),
            ),
          );
          break;
        }
        case 'auth:delete-account-email': {
          const { email, url, lang } = job.data;
          await this.notifyService.sendEmail(
            email,
            this.i18n.t('auth.delete_account_email.subject', { lang }),
            await render(
              DeleteAccount({
                url,
                dictionary: {
                  title: this.i18n.t('auth.delete_account_email.title', { lang }),
                  text: this.i18n.t('auth.delete_account_email.text', { lang }),
                  button: this.i18n.t('auth.delete_account_email.button', { lang }),
                },
              }),
            ),
          );
          break;
        }
        case 'auth:reset-password': {
          const { email, url, lang } = job.data;
          await this.notifyService.sendEmail(
            email,
            this.i18n.t('auth.reset_password.subject', { lang }),
            await render(
              VerificationEmail({
                url,
                dictionary: {
                  title: this.i18n.t('auth.reset_password.title', { lang }),
                  text: this.i18n.t('auth.reset_password.text', { lang }),
                  button: this.i18n.t('auth.reset_password.button', { lang }),
                },
              }),
            ),
          );
          break;
        }
        case 'auth:sign-in-otp-email':
        case 'auth:verification-otp-email':
        case 'auth:password-reset-otp-email': {
          const { email, otp, type, lang } = job.data;

          let subjectKey: string;
          let titleKey: string;
          let textKey: string;

          switch (type) {
            case 'sign-in':
              subjectKey = 'auth.sign_in_otp_email.subject';
              titleKey = 'auth.sign_in_otp_email.title';
              textKey = 'auth.sign_in_otp_email.text';
              break;
            case 'email-verification':
              subjectKey = 'auth.verification_otp_email.subject';
              titleKey = 'auth.verification_otp_email.title';
              textKey = 'auth.verification_otp_email.text';
              break;
            case 'forget-password':
              subjectKey = 'auth.password_reset_otp_email.subject';
              titleKey = 'auth.password_reset_otp_email.title';
              textKey = 'auth.password_reset_otp_email.text';
              break;
            default:
              throw new Error('Invalid OTP email type');
          }

          await this.notifyService.sendEmail(
            email,
            this.i18n.t(subjectKey, { lang }),
            await render(
              VerificationEmail({
                dictionary: {
                  title: this.i18n.t(titleKey, { lang }),
                  text: this.i18n.t(textKey, { lang, args: { otp } }),
                  button: this.i18n.t('auth.otp_email.button', { lang }),
                },
              }),
            ),
          );
          break;
        }
        default:
          this.logger.warn(`Unhandled job`);
      }
    } catch (error) {
      this.logger.error(`Failed to process job ${job.name}: ${error}`);
      throw error;
    }
  }

  private async getDevicesGroupedByLang(userIds: string[]) {
    if (!userIds.length) return {};

    const receiversData = await this.db
      .select({
        userId: pushToken.userId,
        token: pushToken.token,
        provider: pushToken.provider,
        deviceType: pushToken.deviceType,
        language: user.language,
      })
      .from(pushToken)
      .innerJoin(user, eq(user.id, pushToken.userId))
      .innerJoin(authSessions, eq(authSessions.id, pushToken.sessionId))
      .where(and(inArray(pushToken.userId, userIds), gt(authSessions.expiresAt, sql`now()`)));

    return this.groupDevicesByLang(receiversData);
  }

  private groupDevicesByLang<
    T extends { token: string; provider: string; language: string | null },
  >(devices: T[]) {
    const seen = new Set<string>();
    const deduped = devices.filter((device) => {
      const key = `${device.provider}:${device.token}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.reduce(
      (acc, current) => {
        const lang = current.language || defaultSupportedLocale;
        if (!acc[lang]) acc[lang] = [];
        acc[lang].push(current);
        return acc;
      },
      {} as Record<string, T[]>,
    );
  }
}
