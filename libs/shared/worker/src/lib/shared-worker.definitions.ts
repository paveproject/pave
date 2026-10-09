import { Job } from 'bullmq';
import { SearchRegistry, SearchSchemas } from './search/search.registry';

export type WorkerRegistry = SearchRegistry;

export type WorkerJobName = keyof WorkerRegistry;

export const WorkerSchemas = {
  ...SearchSchemas,
} as const;

type DistributiveJob<K extends WorkerJobName> = K extends any
  ? Job<WorkerRegistry[K], any, K>
  : never;

export type WorkerJob = DistributiveJob<WorkerJobName>;

export type SearchJobName = keyof SearchRegistry;
export type SearchJob = DistributiveJob<SearchJobName>;
