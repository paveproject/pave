import { useQuery } from '@tanstack/react-query';
import { pendingActionsOptions } from '@libs/query-client';
import type { MePendingAction } from '@libs/api-js';

/**
 * Finds one specific pending-action row by its own `(kind, id)` pair -
 * used by the `/validation/*` screens to resolve which item they were
 * pushed for. Returns `undefined` once that item is gone for any reason
 * (resolved by this device, resolved elsewhere, revoked) - the screens
 * treat that as their cue to close themselves rather than show stale
 * content, see `usePendingActionsGate`'s own doc comment on why the
 * `Stack.Protected` guard alone isn't precise enough for that.
 */
export const usePendingAction = <K extends MePendingAction['kind']>(
  kind: K,
  id: string | undefined,
): Extract<MePendingAction, { kind: K }> | undefined => {
  const { data } = useQuery(pendingActionsOptions());
  return data?.find((action) => action.kind === kind && action.id === id) as
    | Extract<MePendingAction, { kind: K }>
    | undefined;
};
