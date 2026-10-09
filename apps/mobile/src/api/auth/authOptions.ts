import { queryOptions } from '@tanstack/react-query';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { authKeys } from './authKeys';
import { authClient } from '../../lib/auth/client';

export const authSessionOptions = () => {
  return queryOptions({
    queryKey: authKeys.session(),
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      if (error) throw error;
      return data;
    },
  });
};

export const authCustomerInfoOptions = ({
  initialData,
  enabled = true,
}: {
  initialData?: CustomerInfo;
  enabled?: boolean;
} = {}) => {
  return queryOptions({
    queryKey: authKeys.customerInfo(),
    queryFn: async () => {
      return await Purchases.getCustomerInfo();
    },
    retry: 3,
    retryOnMount: true,
    initialData,
    enabled,
  });
};
