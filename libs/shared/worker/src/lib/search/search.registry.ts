import { z } from 'zod';
import { PrefixRegistry, createPrefixedRegistry } from '../utils';
import { SyncUserSchema } from './search.dto';

export const SEARCH_QUEUE = 'search_queue';
export const SEARCH_PATH = 'search';

const BaseSearchSchemas = {
  'sync-user': SyncUserSchema,
} as const;

export const SearchSchemas = createPrefixedRegistry(SEARCH_PATH, BaseSearchSchemas);

type BaseSearchRegistry = {
  [K in keyof typeof BaseSearchSchemas]: z.input<(typeof BaseSearchSchemas)[K]>;
};

export type SearchRegistry = PrefixRegistry<typeof SEARCH_PATH, BaseSearchRegistry>;
