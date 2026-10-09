import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, Href } from 'expo-router';
import { useSelectionStore, createSelectionKey } from './index';
import { SelectionEntity, SelectionRegistry } from './registry';

export function useSelectionField<E extends SelectionEntity>(
  entity: E,
  onSelect: (value: SelectionRegistry[E]) => void,
  scopeId?: string | number,
) {
  const pathname = usePathname();
  const router = useRouter();
  const scope = scopeId !== undefined ? `${pathname}#${scopeId}` : pathname;
  const key = createSelectionKey(scope, entity);

  const pending = useSelectionStore((state) => state.values[key]) as
    | SelectionRegistry[E]
    | undefined;
  const consume = useSelectionStore((state) => state.consume);
  const pushReturnPath = useSelectionStore((state) => state.pushReturnPath);

  useEffect(() => {
    if (pending !== undefined) {
      onSelect(pending);
      consume(key);
    }
  }, [pending, consume, key, onSelect]);

  const openSelector = useCallback(
    (href: Href) => {
      pushReturnPath(entity, scope);
      router.push(href);
    },
    [router, scope, entity, pushReturnPath],
  );

  return { openSelector };
}
