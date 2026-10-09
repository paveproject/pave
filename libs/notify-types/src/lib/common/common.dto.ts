import z from 'zod';
import { defaultSupportedLocale, supportedLocales } from '@libs/i18n';

export const LangSchema = z.object({
  lang: z.enum(supportedLocales).default(defaultSupportedLocale),
});
