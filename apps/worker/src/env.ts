import { workerSchema, validateEnv } from '@libs/env';

export const env = validateEnv(workerSchema);
