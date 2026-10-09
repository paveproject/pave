import { useEffect, useMemo, useRef } from 'react';
import { useOnboardingGate } from './useOnboardingGate';
import { useWelcomeGate } from './useWelcomeGate';
import { useRateAppGate } from './useRateAppGate';

/**
 * Presents at most one app-level gate at a time (onboarding, welcome, rate-app, ...),
 * in priority order, so they never stack on top of each other. A gate is only ever
 * considered once every gate ahead of it in the list is no longer needed.
 */
export const useAppGates = () => {
  const onboardingGate = useOnboardingGate();
  const welcomeGate = useWelcomeGate();
  const rateAppGate = useRateAppGate();

  // Order = priority.
  const gates = useMemo(
    () => [onboardingGate, welcomeGate, rateAppGate],
    [onboardingGate, welcomeGate, rateAppGate],
  );
  const presentedIdRef = useRef<string | null>(null);

  useEffect(() => {
    const nextGate = gates.find((gate) => gate.isNeeded);
    if (!nextGate) {
      presentedIdRef.current = null;
      return;
    }
    // Already presented (or dismissed without resolving) this session: don't retry.
    if (presentedIdRef.current === nextGate.id) return;
    presentedIdRef.current = nextGate.id;
    if (!nextGate.isPresented) {
      nextGate.present();
    }
  }, [gates]);
};
