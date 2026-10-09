import { CursorPaginationMeta, PaginationMeta } from '@libs/api-js';
import { InfiniteData, QueryClient, QueryFilters, QueryKey } from '@tanstack/react-query';

export type ItemUpdater<TItem> = Partial<TItem> | ((item: TItem) => Partial<TItem>);

export const resolveUpdater = <TItem>(item: TItem, updater: ItemUpdater<TItem>): Partial<TItem> =>
  typeof updater === 'function' ? updater(item) : updater;

/* -------------------------------- Flat -------------------------------- */
export const updateFromFlatCache = <TItem>(
  queryClient: QueryClient,
  filters: QueryKey | QueryFilters,
  updater: ItemUpdater<TItem>,
  matcher?: string | number | ((item: TItem) => boolean),
): void => {
  const queryFilters: QueryFilters = Array.isArray(filters)
    ? { queryKey: filters }
    : (filters as QueryFilters);

  queryClient.setQueriesData(queryFilters, (oldData: TItem[] | undefined) => {
    if (!oldData) return oldData;
    return oldData.map((item) => {
      const isMatch =
        typeof matcher === 'function'
          ? matcher(item)
          : matcher !== undefined
            ? (item as any).id === matcher
            : 'id' in (typeof updater === 'function' ? {} : updater) &&
              (item as any).id === (updater as any).id;

      return isMatch ? { ...item, ...resolveUpdater(item, updater) } : item; // <-- resolveUpdater ici aussi
    });
  });
};

export const removeFromFlatCache = <TItem>(
  queryClient: QueryClient,
  filters: QueryKey | QueryFilters,
  matcher: string | number | ((item: TItem) => boolean),
): void => {
  const queryFilters: QueryFilters = Array.isArray(filters)
    ? { queryKey: filters }
    : (filters as QueryFilters);

  queryClient.setQueriesData(queryFilters, (oldData: TItem[] | undefined) => {
    if (!oldData) return oldData;
    return oldData.filter((item) =>
      typeof matcher === 'function' ? !matcher(item) : (item as any).id !== matcher,
    );
  });
};

/* -------------------------------- Paginated ------------------------------- */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export const updateFromPaginatedCache = <TItem, TPage extends PaginatedResponse<TItem>>(
  oldData: TPage | undefined,
  updater: ItemUpdater<TItem>,
  matcher?: string | number | ((item: TItem) => boolean),
): TPage | undefined => {
  if (!oldData) return oldData;

  return {
    ...oldData,
    data: oldData.data.map((item) => {
      const isMatch =
        typeof matcher === 'function'
          ? matcher(item)
          : matcher !== undefined
            ? (item as any).id === matcher
            : 'id' in (typeof updater === 'function' ? {} : updater) &&
              (item as any).id === (updater as any).id;

      return isMatch ? { ...item, ...resolveUpdater(item, updater) } : item;
    }),
  };
};

export const removeFromPaginatedCache = <TItem, TPage extends PaginatedResponse<TItem>>(
  queryClient: QueryClient,
  filters: QueryKey | QueryFilters,
  matcher: string | number | ((item: TItem) => boolean),
): void => {
  const queryFilters: QueryFilters = Array.isArray(filters)
    ? { queryKey: filters }
    : (filters as QueryFilters);

  const matchedQueries = queryClient.getQueriesData<TPage>(queryFilters);

  if (!matchedQueries.length) return;

  const groupedQueries = matchedQueries.reduce(
    (acc, query) => {
      const [queryKey, data] = query;
      if (!data) return acc;

      const baseKeyString = JSON.stringify(queryKey.slice(0, -1));
      if (!acc[baseKeyString]) acc[baseKeyString] = [];
      acc[baseKeyString].push(query);
      return acc;
    },
    {} as Record<string, typeof matchedQueries>,
  );

  Object.values(groupedQueries).forEach((group) => {
    const validQueries = group.sort(
      ([, dataA], [, dataB]) => dataA!.meta.current_page - dataB!.meta.current_page,
    );

    let itemFound = false;
    const allItems = validQueries.flatMap(([, data]) => data!.data);

    const filteredItems = allItems.filter((item) => {
      const isMatch = typeof matcher === 'function' ? matcher(item) : (item as any).id === matcher;

      if (isMatch) {
        itemFound = true;
        return false;
      }
      return true;
    });

    if (!itemFound) return;

    const perPage = validQueries[0][1]!.meta.per_page;
    let lastAffectedQueryKey: QueryKey | null = null;

    validQueries.forEach(([queryKey, originalPage], index) => {
      const pageItems = filteredItems.slice(index * perPage, (index + 1) * perPage);

      const newTotalResults = Math.max(0, originalPage!.meta.total_results - 1);
      const newTotalPages = Math.ceil(newTotalResults / perPage);

      const newPage: TPage = {
        ...originalPage!,
        data: pageItems,
        meta: {
          ...originalPage!.meta,
          total_results: newTotalResults,
          total_pages: newTotalPages,
        },
      };

      queryClient.setQueryData(queryKey, newPage);
      lastAffectedQueryKey = queryKey;
    });

    if (lastAffectedQueryKey) {
      queryClient.invalidateQueries({ queryKey: lastAffectedQueryKey });
    }
  });
};

/* -------------------------------- Infinite -------------------------------- */
export interface InfinitePaginatedResponse<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export const updateFromInfiniteCache = <TItem, TPage extends InfinitePaginatedResponse<TItem>>(
  oldData: InfiniteData<TPage> | undefined,
  updater: ItemUpdater<TItem>,
  matcher?: string | number | ((item: TItem) => boolean),
): InfiniteData<TPage> | undefined => {
  if (!oldData) return oldData;

  return {
    ...oldData,
    pages: oldData.pages.map((page) => ({
      ...page,
      data: page.data.map((item) => {
        const isMatch =
          typeof matcher === 'function'
            ? matcher(item)
            : matcher !== undefined
              ? (item as any).id === matcher
              : 'id' in (typeof updater === 'function' ? {} : updater) &&
                (item as any).id === (updater as any).id;

        return isMatch ? { ...item, ...resolveUpdater(item, updater) } : item;
      }),
    })),
  };
};

export const removeFromInfiniteCache = <TItem, TPage extends InfinitePaginatedResponse<TItem>>(
  oldData: InfiniteData<TPage> | undefined,
  matcher: string | number | ((item: TItem) => boolean),
): InfiniteData<TPage> | undefined => {
  if (!oldData) return oldData;

  return {
    ...oldData,
    pages: oldData.pages.map((page, index) => {
      const newData = page.data.filter((item) => {
        const isMatch =
          typeof matcher === 'function' ? matcher(item) : (item as any).id === matcher;
        return !isMatch;
      });

      let newMeta = page.meta;
      if (index === 0 && typeof newMeta.total_results === 'number') {
        newMeta = {
          ...newMeta,
          total_results: Math.max(0, newMeta.total_results - 1),
        };
      }

      return {
        ...page,
        data: newData,
        meta: newMeta,
      };
    }),
  };
};
export const updateListItemInAllCaches = <
  TItem,
  TPaginated extends PaginatedResponse<TItem>,
  TInfinite extends InfinitePaginatedResponse<TItem>,
>(
  queryClient: QueryClient,
  filters: {
    all?: QueryKey | QueryFilters;
    paginated?: QueryKey | QueryFilters;
    infinite?: QueryKey | QueryFilters;
  },
  updater: ItemUpdater<TItem>,
  matcher?: string | number | ((item: TItem) => boolean),
) => {
  if (filters.all) {
    updateFromFlatCache(queryClient, filters.all, updater, matcher);
  }

  if (filters.paginated) {
    const queryFilters = Array.isArray(filters.paginated)
      ? { queryKey: filters.paginated }
      : (filters.paginated as QueryFilters);

    queryClient.setQueriesData(queryFilters, (oldData: TPaginated | undefined) =>
      updateFromPaginatedCache(oldData, updater, matcher),
    );
  }

  if (filters.infinite) {
    const queryFilters = Array.isArray(filters.infinite)
      ? { queryKey: filters.infinite }
      : (filters.infinite as QueryFilters);

    queryClient.setQueriesData(queryFilters, (oldData: InfiniteData<TInfinite> | undefined) =>
      updateFromInfiniteCache(oldData, updater, matcher),
    );
  }
};

export const removeListItemFromAllCaches = <
  TItem,
  TPaginated extends PaginatedResponse<TItem>,
  TInfinite extends InfinitePaginatedResponse<TItem>,
>(
  queryClient: QueryClient,
  filters: {
    all?: QueryKey | QueryFilters;
    paginated?: QueryKey | QueryFilters;
    infinite?: QueryKey | QueryFilters;
  },
  matcher: string | number | ((item: TItem) => boolean),
) => {
  if (filters.all) {
    removeFromFlatCache<TItem>(queryClient, filters.all, matcher);
  }

  if (filters.paginated) {
    removeFromPaginatedCache<TItem, TPaginated>(queryClient, filters.paginated, matcher);
  }

  if (filters.infinite) {
    const queryFilters = Array.isArray(filters.infinite)
      ? { queryKey: filters.infinite }
      : (filters.infinite as QueryFilters);

    queryClient.setQueriesData(queryFilters, (oldData: InfiniteData<TInfinite> | undefined) =>
      removeFromInfiniteCache<TItem, TInfinite>(oldData, matcher),
    );
  }
};

export const updateOrRemoveListItemInAllCaches = <
  TItem,
  TPaginated extends PaginatedResponse<TItem>,
  TInfinite extends InfinitePaginatedResponse<TItem>,
>(
  queryClient: QueryClient,
  filters: {
    all?: QueryKey | QueryFilters;
    paginated?: QueryKey | QueryFilters;
    infinite?: QueryKey | QueryFilters;
  },
  matcher: (item: TItem) => boolean,
  modifier: (item: TItem) => Partial<TItem> | null,
) => {
  let currentItem: TItem | undefined;

  if (filters.all && !currentItem) {
    const queryFilters = Array.isArray(filters.all)
      ? { queryKey: filters.all }
      : (filters.all as QueryFilters);
    const queries = queryClient.getQueriesData<TItem[]>(queryFilters);
    for (const [, data] of queries) {
      if (data) currentItem = data.find(matcher);
      if (currentItem) break;
    }
  }

  if (filters.infinite && !currentItem) {
    const queryFilters = Array.isArray(filters.infinite)
      ? { queryKey: filters.infinite }
      : (filters.infinite as QueryFilters);
    const queries = queryClient.getQueriesData<InfiniteData<TInfinite>>(queryFilters);
    for (const [, data] of queries) {
      if (data?.pages) {
        for (const page of data.pages) {
          currentItem = page.data?.find(matcher);
          if (currentItem) break;
        }
      }
      if (currentItem) break;
    }
  }

  if (filters.paginated && !currentItem) {
    const queryFilters = Array.isArray(filters.paginated)
      ? { queryKey: filters.paginated }
      : (filters.paginated as QueryFilters);
    const queries = queryClient.getQueriesData<TPaginated>(queryFilters);
    for (const [, data] of queries) {
      if (data?.data) currentItem = data.data.find(matcher);
      if (currentItem) break;
    }
  }

  if (!currentItem) return;

  const updatedItemOrNull = modifier(currentItem);

  if (updatedItemOrNull === null) {
    removeListItemFromAllCaches<TItem, TPaginated, TInfinite>(queryClient, filters, matcher);
  } else {
    updateListItemInAllCaches<TItem, TPaginated, TInfinite>(
      queryClient,
      filters,
      updatedItemOrNull,
      matcher,
    );
  }
};
