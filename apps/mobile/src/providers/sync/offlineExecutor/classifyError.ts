import { NonRetriableError } from '@tanstack/offline-transactions/react-native';

const NON_RETRIABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

/**
 * Turns a failed API response into the right kind of error for the
 * offline executor's retry policy: a client error that will never
 * succeed just by trying again (bad body, not found, not authorized)
 * throws `NonRetriableError` so the executor gives up on it immediately;
 * anything else (429 rate-limited, 5xx, network blip) throws a plain
 * `Error`, which retries with backoff.
 */
export const throwForFailedResponse = (status: number | undefined, context: string): never => {
  if (status !== undefined && NON_RETRIABLE_STATUSES.has(status)) {
    throw new NonRetriableError(`${context} rejected (${status})`);
  }
  throw new Error(`${context} failed (${status ?? 'network error'})`);
};
