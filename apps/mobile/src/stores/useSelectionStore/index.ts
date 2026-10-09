import { create } from 'zustand';
import { SelectionEntity, SelectionRegistry } from './registry';

export type SelectionKey<E extends SelectionEntity = SelectionEntity> = string & {
  readonly __entity?: E;
};

export function createSelectionKey<E extends SelectionEntity>(
  scope: string,
  entity: E,
): SelectionKey<E> {
  return `${scope}::${entity}` as SelectionKey<E>;
}

interface SelectionStoreState {
  values: Record<string, unknown>;
  returnPathStacks: Partial<Record<SelectionEntity, string[]>>;

  resolve: <E extends SelectionEntity>(key: SelectionKey<E>, value: SelectionRegistry[E]) => void;
  consume: <E extends SelectionEntity>(key: SelectionKey<E>) => SelectionRegistry[E] | undefined;

  pushReturnPath: (entity: SelectionEntity, scope: string) => void;
  popReturnPath: (entity: SelectionEntity) => string | undefined;
}

export const useSelectionStore = create<SelectionStoreState>((set, get) => ({
  values: {},
  returnPathStacks: {},

  resolve: (key, value) => set((state) => ({ values: { ...state.values, [key]: value } })),
  consume: (key) => {
    const value = get().values[key];
    if (value !== undefined) {
      set((state) => {
        const next = { ...state.values };
        delete next[key];
        return { values: next };
      });
    }
    // The generic <E> on the public `consume` signature can't be bound inside this plain
    // implementation (TS can't narrow an object-literal method against a generic interface
    // signature) — callers still get the correctly narrowed `SelectionRegistry[E] | undefined`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return value as any;
  },

  pushReturnPath: (entity, scope) =>
    set((state) => ({
      returnPathStacks: {
        ...state.returnPathStacks,
        [entity]: [...(state.returnPathStacks[entity] || []), scope],
      },
    })),
  popReturnPath: (entity) => {
    const stack = get().returnPathStacks[entity] || [];
    const scope = stack[stack.length - 1];
    if (scope !== undefined) {
      set((state) => ({
        returnPathStacks: {
          ...state.returnPathStacks,
          [entity]: stack.slice(0, -1),
        },
      }));
    }
    return scope;
  },
}));
