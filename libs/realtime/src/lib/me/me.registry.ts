export const MeServerEvents = {
  UPDATED: 'me:updated',
} as const;

export type MeServerEventName = (typeof MeServerEvents)[keyof typeof MeServerEvents];
