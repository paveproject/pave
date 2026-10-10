import { queryOptions } from '@tanstack/react-query';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { authKeys } from './authKeys';

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
