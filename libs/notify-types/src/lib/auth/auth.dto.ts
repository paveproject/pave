import { z } from 'zod';
import { LangSchema } from '../common/common.dto';

export const SendVerificationEmailSchema = LangSchema.extend({
  email: z.email(),
  url: z.url(),
  token: z.string(),
});
export type SendVerificationEmailDto = z.infer<typeof SendVerificationEmailSchema>;

export const SendDeleteAccountVerificationEmailSchema = LangSchema.extend({
  email: z.email(),
  url: z.url(),
  token: z.string(),
});
export type SendDeleteAccountVerificationEmailDto = z.infer<
  typeof SendDeleteAccountVerificationEmailSchema
>;

export const SendResetPasswordEmailSchema = LangSchema.extend({
  email: z.email(),
  url: z.url(),
  token: z.string(),
});
export type SendResetPasswordEmailDto = z.infer<typeof SendResetPasswordEmailSchema>;

export const SendOtpEmailSchema = LangSchema.extend({
  email: z.email(),
  otp: z.string(),
  type: z.enum(['sign-in', 'email-verification', 'forget-password']),
});
export type SendOtpEmailDto = z.infer<typeof SendOtpEmailSchema>;
