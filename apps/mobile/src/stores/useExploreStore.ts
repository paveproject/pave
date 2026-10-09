import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

interface Filters {
  runtime: {
    min: number | null;
    max: number | null;
  };
  releaseDate: {
    min: number | null;
    max: number | null;
  };
  genres: {
    selected: number[];
    match: 'any' | 'all';
  };
  user: {
    hideWatched: boolean;
  };
}

interface ExploreStore {
  filters: Filters;
  activeFiltersCount: number;
  setFilters: (filters: DeepPartial<Filters>) => void;
  resetFilters: () => void;
}

export const useExploreStore = create<ExploreStore>()(
  persist(
    (set) => ({
      filters: {
        runtime: {
          min: null,
          max: null,
        },
        releaseDate: {
          min: null,
          max: null,
        },
        genres: {
          selected: [],
          match: 'any',
        },
        user: {
          hideWatched: false,
        },
      },
      activeFiltersCount: 0,
      setFilters: (filters) =>
        set((state) => {
          const merged = deepMerge(state.filters, filters);

          const activeFiltersCount =
            (merged.runtime.min != null || merged.runtime.max != null ? 1 : 0) +
            (merged.releaseDate.min != null || merged.releaseDate.max != null ? 1 : 0) +
            (merged.genres.selected.length > 0 ? 1 : 0) +
            (merged.user.hideWatched ? 1 : 0);

          return { filters: merged, activeFiltersCount };
        }),
      resetFilters: () =>
        set((state) => ({
          filters: {
            runtime: {
              min: null,
              max: null,
            },
            releaseDate: {
              min: null,
              max: null,
            },
            genres: {
              selected: [],
              match: state.filters.genres.match,
            },
            user: {
              hideWatched: false,
            },
          },
          activeFiltersCount: 0,
        })),
    }),
    {
      name: 'explore-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);

function deepMerge<T>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const srcVal = source[key];
    const tgtVal = target[key];

    if (srcVal === undefined) continue;

    if (typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal)) {
      result[key] = deepMerge(tgtVal as any, srcVal as any);
    } else {
      result[key] = srcVal as any;
    }
  }

  return result;
}
