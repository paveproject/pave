interface NavRouteState {
  routes?: { name: string; state?: NavRouteState }[];
}

export const isRouteInStack = (state: NavRouteState | undefined, name: string): boolean => {
  if (!state?.routes) return false;
  return state.routes.some((route) => route.name === name || isRouteInStack(route.state, name));
};
