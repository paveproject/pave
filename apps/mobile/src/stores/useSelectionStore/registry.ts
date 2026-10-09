import { MovieCompact, TvSeriesCompact } from '@libs/api-js';

export interface SelectionRegistry {
  movie: MovieCompact;
  tv_series: TvSeriesCompact;
}

export type SelectionEntity = keyof SelectionRegistry;
