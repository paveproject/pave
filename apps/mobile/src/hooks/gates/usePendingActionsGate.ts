import { useCallback } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { pendingActionsOptions } from '@libs/query-client';
import { useAuth } from '../../providers/AuthProvider';
import { isRouteInStack } from './isRouteInStack';
import { AppGate } from './types';

const ROUTE_BY_KIND = {
  device_registration: 'validation/device/[id]',
  recovery_request_contact: 'validation/recovery-request/[id]',
  own_device_registration: 'validation/own-device/[id]',
} as const;

/**
 * Something waiting on this account - someone else's device or recovery
 * request needing *this* device's approval, or (via the
 * `own_device_registration` kind) this device's own pending status,
 * shown to itself while it waits on a sibling. The highest-priority gate
 * in `useAppGates`, since these are time-sensitive and someone (possibly
 * this device's own user) is actively waiting on one.
 *
 * Unlike the other gates here, this one's `id` changes with *which* item
 * is currently oldest, not just whether the gate as a whole is needed -
 * that's deliberate: `useAppGates`' "don't re-present the same gate twice
 * in a row" dedup is keyed on `id`, and a queue needs the *next* item to
 * count as a fresh gate the instant the current one resolves, rather than
 * being mistaken for a repeat of the same one. The `/validation/*` screen
 * itself (via `usePendingAction`) is what actually notices an item is
 * gone and closes - this gate only ever has to get the *next* one
 * presented once that happens.
 *
 * `own_device_registration` additionally folds `updatedAt` into the id -
 * every other kind is a genuinely new item each time, but this one is
 * the *same* device for as long as it stays pending, so without this a
 * deliberate "resend request" tap (see `settings/recovery.tsx`) would
 * never re-open the popup: the gate would see it as the exact same thing
 * already dismissed this session. `set_device` bumps `updatedAt` on
 * every call, including a resend, which is what defeats the dedup
 * exactly when that's wanted.
 */
export const usePendingActionsGate = (): AppGate => {
  const { user } = useAuth();
  const router = useRouter();
  const rootState = useRootNavigationState();
  const { data } = useQuery({ ...pendingActionsOptions(), enabled: !!user });
  const current =
    data && data.length > 0
      ? [...data].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
      : null;

  const present = useCallback(() => {
    if (!current) return;
    if (current.kind === 'device_registration') {
      router.push({ pathname: '/validation/device/[id]', params: { id: current.id } });
    } else if (current.kind === 'recovery_request_contact') {
      router.push({ pathname: '/validation/recovery-request/[id]', params: { id: current.id } });
    } else {
      router.push({ pathname: '/validation/own-device/[id]', params: { id: current.id } });
    }
  }, [router, current]);

  return {
    id: !current
      ? 'pending-actions'
      : current.kind === 'own_device_registration'
        ? `pending-actions:${current.kind}:${current.id}:${current.updatedAt}`
        : `pending-actions:${current.kind}:${current.id}`,
    isNeeded: !!current,
    isPresented: current
      ? isRouteInStack(rootState, ROUTE_BY_KIND[current.kind], current.id)
      : false,
    present,
  };
};
