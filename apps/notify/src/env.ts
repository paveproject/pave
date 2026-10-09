import { notifySchema, validateEnv } from '@libs/env';

export const env = validateEnv(notifySchema);
