import { authKeys } from '../api/auth/authKeys';
import { REVENUECAT_API_KEY } from '../lib/revenue-cat';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import Purchases, { CustomerInfo, LOG_LEVEL } from 'react-native-purchases';
import { User } from '@libs/api-js';

export const useRevenueCat = (user: User | null | undefined) => {
  const queryClient = useQueryClient();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | undefined>(undefined);
  const [isInitialized, setIsInitialized] = useState(false);

  const init = useCallback(async (userId: string) => {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    }
    if (!REVENUECAT_API_KEY) {
      throw new Error('RevenueCat API key missing');
    }
    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId,
    });
    setIsInitialized(true);
  }, []);
  const login = useCallback(async (user: User) => {
    const { customerInfo } = await Purchases.logIn(user.id);
    if (user.email) {
      await Purchases.setAttributes({
        $email: user.email,
      });
    }
    setCustomerInfo(customerInfo);
  }, []);

  useEffect(() => {
    if (!isInitialized && user?.id) {
      // Purchases SDK init — imperative one-time setup, not derivable from render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      init(user?.id).catch(console.error);
      return;
    }
    if (user) {
      login(user);
      queryClient.invalidateQueries({
        queryKey: authKeys.customerInfo(),
      });
    } else {
      queryClient.setQueryData(authKeys.customerInfo(), null);
      setCustomerInfo(undefined);
    }
  }, [user, isInitialized, init, login, queryClient]);

  return { customerInfo, isInitialized, login };
};
