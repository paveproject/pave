interface NavRouteState {
  routes?: { name: string; params?: unknown; state?: NavRouteState }[];
}

/**
 * Whether a route named `name` is anywhere in the navigation state tree -
 * and, when `id` is given, whether one of those matches specifically
 * carries that `id` param.
 *
 * The `id` check matters for any dynamic route a gate reuses across
 * different targets back-to-back (e.g. `validation/device/[id]`, see
 * `usePendingActionsGate`'s own doc comment on why its `id` changes to
 * the *next* item the instant the current one resolves). Checking the
 * route name alone is a trap in exactly that moment: the *previous*
 * item's screen is still mounted (closing itself once its own
 * `usePendingAction` notices it's gone) while the gate has already moved
 * on to the next `id` - without this, that still-mounted screen reads as
 * "the next item is already presented" even though it was never actually
 * routed to, permanently marking it shown and leaving it stuck until a
 * relaunch resets the dedup ref.
 */
export const isRouteInStack = (
  state: NavRouteState | undefined,
  name: string,
  id?: string,
): boolean => {
  if (!state?.routes) return false;
  return state.routes.some((route) => {
    if (route.name === name) {
      return id === undefined || (route.params as { id?: string } | undefined)?.id === id;
    }
    return isRouteInStack(route.state, name, id);
  });
};
