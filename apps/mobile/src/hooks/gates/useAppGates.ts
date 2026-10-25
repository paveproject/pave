import { useEffect, useMemo, useRef } from 'react';
import { usePendingActionsGate } from './usePendingActionsGate';
import { useWelcomeGate } from './useWelcomeGate';
import { useRateAppGate } from './useRateAppGate';

// Temporarily off while rate-app is under rework - flip back to true
// once it's ready to gate on again. Onboarding used to be covered by
// this same flag, but it's now enforced declaratively at the root
// `Stack.Protected` level (see `app/_layout.tsx`'s `hasOnboarded` guard)
// instead of through this imperative gate queue, so it no longer needs
// a place here. Deliberately doesn't cover `pendingActionsGate` (someone
// may be actively waiting on one of those, so it can't be put on hold
// alongside an unrelated rework) or `welcomeGate` (always on - every
// signed-up user needs to see it once, see the array below - it's
// listed outside this flag on purpose).
const REWORK_GATES_ENABLED = false;

// How long to wait before presenting the *next* gate once a previous one
// has just resolved - not applied to the very first presentation (nothing
// to wait on then). Pushing a new formSheet while the previous one's pop
// transition is still in flight can leave the new screen's native sheet
// host presented (grabber visible, no header) with its own React content
// never actually mounted - this just gives that dismiss animation time to
// genuinely finish first. Not tied to the design system's own animation
// tokens (`theme.animations.durations`) - this is a native navigation
// transition, not an in-app UI one.
const GATE_TRANSITION_DELAY_MS = 400;

/**
 * Presents at most one app-level gate at a time (pending approvals -
 * including this device's own pending status - welcome, rate-app, ...),
 * in priority order, so they never stack on top of each other. A gate
 * is only ever considered once every gate ahead of it in the list is no
 * longer needed.
 */
export const useAppGates = () => {
  const pendingActionsGate = usePendingActionsGate();
  const welcomeGate = useWelcomeGate();
  const rateAppGate = useRateAppGate();

  // Order = priority - pending approvals always come first.
  const gates = useMemo(
    () => [pendingActionsGate, welcomeGate, ...(REWORK_GATES_ENABLED ? [rateAppGate] : [])],
    [pendingActionsGate, welcomeGate, rateAppGate],
  );
  const presentedIdRef = useRef<string | null>(null);
  // The id a `present()` call is currently scheduled (or was just made)
  // for, paired with its pending timer (if any) - lets a later render
  // notice the target changed before the delay elapsed and cancel the
  // now-stale one, instead of presenting whatever used to be `current`.
  const scheduledRef = useRef<{ id: string; timer?: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    const nextGate = gates.find((gate) => gate.isNeeded);

    if (!nextGate) {
      presentedIdRef.current = null;
      if (scheduledRef.current?.timer) clearTimeout(scheduledRef.current.timer);
      scheduledRef.current = null;
      return;
    }

    if (nextGate.isPresented) {
      // Confirmed actually on-screen now - remember it so a later
      // dismissal (still needed, just closed by the user) isn't mistaken
      // for "never successfully shown" below.
      presentedIdRef.current = nextGate.id;
      if (scheduledRef.current?.timer) clearTimeout(scheduledRef.current.timer);
      scheduledRef.current = null;
      return;
    }

    // Not on-screen. Only skip re-presenting if this exact item was
    // already *confirmed* shown before (the `isPresented` branch above is
    // the only place that sets the ref) - a route gated by
    // `Stack.Protected` on data from a separate `useQuery` subscriber
    // (see `app/_layout.tsx`'s own guards) can still read `false` for a
    // render or two after `isNeeded` first flips true, so a `present()`
    // call made in that window silently does nothing (the screen isn't
    // registered yet). Retrying on every subsequent render where the ref
    // doesn't match is what makes that self-healing instead of
    // permanently marking an item "shown" that never actually was.
    if (presentedIdRef.current === nextGate.id) return;

    // Already got a timer running for this exact target - let it be,
    // don't restart the delay on every re-render in the meantime.
    if (scheduledRef.current?.id === nextGate.id) return;

    // Target changed before the previous timer fired (e.g. the user
    // dismissed item 2 before its delay elapsed and item 3 is now next) -
    // cancel it, it would otherwise present something no longer current.
    if (scheduledRef.current?.timer) clearTimeout(scheduledRef.current.timer);

    if (presentedIdRef.current === null) {
      // Nothing was presented before this - no transition to wait out.
      scheduledRef.current = null;
      nextGate.present();
      return;
    }

    const timer = setTimeout(() => {
      scheduledRef.current = null;
      nextGate.present();
    }, GATE_TRANSITION_DELAY_MS);
    scheduledRef.current = { id: nextGate.id, timer };
  }, [gates]);

  // Unmount-only cleanup - the effect above already cancels a stale timer
  // itself whenever the target changes, so this must not run on every
  // re-render (it would cancel a still-valid, still-pending timer the
  // instant `gates` gets a new identity, which is every render).
  useEffect(() => {
    return () => {
      if (scheduledRef.current?.timer) clearTimeout(scheduledRef.current.timer);
    };
  }, []);
};
