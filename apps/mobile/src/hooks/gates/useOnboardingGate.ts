import { useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useUIStore } from '../../stores/useUIStore';
import { AppGate } from './types';

export const useOnboardingGate = (): AppGate => {
  const router = useRouter();
  const segments = useSegments();
  const hasOnboarded = useUIStore((state) => state.hasOnboarded);

  const present = useCallback(() => {
    router.replace({ pathname: '/onboarding' });
  }, [router]);

  return {
    id: 'onboarding',
    isNeeded: !hasOnboarded,
    isPresented: segments.some((segment) => segment === 'onboarding'),
    present,
  };
};
