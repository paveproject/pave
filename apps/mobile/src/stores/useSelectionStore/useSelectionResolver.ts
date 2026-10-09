import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useSelectionStore, createSelectionKey } from './index';
import { SelectionEntity, SelectionRegistry } from './registry';

export function useSelectionResolver<E extends SelectionEntity>(entity: E) {
  const router = useRouter();
  const resolve = useSelectionStore((state) => state.resolve);
  const popReturnPath = useSelectionStore((state) => state.popReturnPath);

  return useCallback(
    (value: SelectionRegistry[E], backCount = 1) => {
      const returnScope = popReturnPath(entity);
      if (!returnScope) {
        console.warn(`No active returnPath for "${entity}"`);
        return;
      }
      const key = createSelectionKey(returnScope, entity);
      resolve(key, value);
      for (let i = 0; i < backCount; i++) router.back();
    },
    [resolve, popReturnPath, entity, router],
  );
}
