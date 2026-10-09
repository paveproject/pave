import { z } from 'zod';

/* --------------------------------- MODULES -------------------------------- */
export const redisSchema = z.object({
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

export const typesenseSchema = z.object({
  TYPESENSE_HOST: z.string(),
  TYPESENSE_PORT: z.coerce.number().default(8108),
  TYPESENSE_PROTOCOL: z.enum(['http', 'https']).default('http'),
  TYPESENSE_API_KEY: z.string(),
});

export const s3Schema = z.object({
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('eu-west-1'),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_BUCKET: z.string().default('medias'),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  // Private bucket for import/export files (never made public) — see libs/db import.ts / apps/api imports module
  S3_IMPORTS_BUCKET: z.string().default('imports'),
});

export const extensionSchema = redisSchema;

export const commonSchema = extensionSchema.extend({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WEB_APP_URL: z.url().default('http://localhost:3000'),
});

// Static assets served from MinIO/S3 (see libs/assets)
export const assetsSchema = z.object({
  ASSETS_BASE_URL: z.url(),
});
/* -------------------------------------------------------------------------- */

export const apiSchema = commonSchema
  .extend(s3Schema.shape)
  .extend(typesenseSchema.shape)
  .extend(assetsSchema.shape)
  .extend({
    PORT: z.coerce.number().default(9000),
    HOST: z.string().default('0.0.0.0'),
    API_URL: z.url().default('https://api.pave.app'),
    DATABASE_URL: z.string(),
    MOBILE_APP_SCHEME: z.string().default('pave://'),

    // Auth
    AUTH_COOKIE_DOMAIN: z.string().default('pave.app'),
    AUTH_SECRET: z.string(),

    // OAuth
    AUTH_GOOGLE_CLIENT_ID: z.string(),
    AUTH_GOOGLE_IOS_CLIENT_ID: z.string(),
    AUTH_GOOGLE_ANDROID_CLIENT_ID: z.string(),
    AUTH_GOOGLE_CLIENT_SECRET: z.string(),
    AUTH_GITHUB_CLIENT_ID: z.string(),
    AUTH_GITHUB_CLIENT_SECRET: z.string(),
    AUTH_FACEBOOK_CLIENT_ID: z.string(),
    AUTH_FACEBOOK_CLIENT_SECRET: z.string(),
    AUTH_APPLE_CLIENT_ID: z.string(),
    AUTH_APPLE_TEAM_ID: z.string(),
    AUTH_APPLE_KEY_ID: z.string(),
    AUTH_APPLE_PRIVATE_KEY: z.string(),
    AUTH_APPLE_BUNDLE_ID: z.string(),

    // RevenueCat
    REVENUECAT_API_KEY: z.string(),
    REVENUECAT_WEBHOOK_SECRET: z.string(),
  });

export const notifySchema = commonSchema.extend(assetsSchema.shape).extend({
  PORT: z.coerce.number().default(9001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string(),

  RESEND_API_KEY: z.string().startsWith('re_'),
  RESEND_FROM_EMAIL: z.string().default('Pavé <hello@pave.app>'),

  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_CLIENT_EMAIL: z.string(),
  FIREBASE_PRIVATE_KEY_B64: z.string().transform((str) => {
    return Buffer.from(str, 'base64').toString('utf-8');
  }),

  APNS_KEY_B64: z.string().transform((str) => {
    return Buffer.from(str, 'base64').toString('utf-8');
  }),
  APNS_KEY_ID: z.string(),
  APNS_TEAM_ID: z.string(),
  APNS_BUNDLE_ID: z.string(),
});

export const workerSchema = commonSchema.extend(typesenseSchema.shape).extend({
  PORT: z.coerce.number().default(9002),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string(),
});

export function validateEnv<T extends z.ZodType>(schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}
