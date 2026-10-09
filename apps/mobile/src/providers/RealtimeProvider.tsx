import { PropsWithChildren } from 'react';
import { useRealtimeSync } from '@libs/query-client';
import { useAuth } from './AuthProvider';

export const RealtimeProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuth();

  useRealtimeSync(!!user);

  return children;
};
