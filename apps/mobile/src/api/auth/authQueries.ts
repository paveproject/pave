import { CustomerInfo } from 'react-native-purchases';
import { authCustomerInfoOptions } from './authOptions';
import { useQuery } from '@tanstack/react-query';

export const useAuthCustomerInfoQuery = ({
  initialData,
  enabled = true,
}: {
  initialData?: CustomerInfo;
  enabled?: boolean;
} = {}) => {
  return useQuery(
    authCustomerInfoOptions({
      initialData,
      enabled,
    }),
  );
};
