import {
  SendDeleteAccountVerificationEmailDto,
  SendOtpEmailDto,
  SendResetPasswordEmailDto,
  SendVerificationEmailDto,
} from './auth.dto';

export type NotifyAuthRegistry = {
  'auth:verification-email': SendVerificationEmailDto;
  'auth:delete-account-email': SendDeleteAccountVerificationEmailDto;
  'auth:reset-password': SendResetPasswordEmailDto;
  'auth:sign-in-otp-email': SendOtpEmailDto;
  'auth:verification-otp-email': SendOtpEmailDto;
  'auth:password-reset-otp-email': SendOtpEmailDto;
};
