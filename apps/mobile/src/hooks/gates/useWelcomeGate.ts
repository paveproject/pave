import { useCallback } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { isRouteInStack } from './isRouteInStack';
import { AppGate } from './types';

export const useWelcomeGate = (): AppGate => {
  const { user } = useAuth();
  const router = useRouter();
  const rootState = useRootNavigationState();

  const present = useCallback(() => {
    router.push({ pathname: '/welcome' });
  }, [router]);

  return {
    id: 'welcome',
    isNeeded: !!user && user.welcomedAt == null,
    isPresented: isRouteInStack(rootState, 'welcome'),
    present,
  };
};
