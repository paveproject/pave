import { queryOptions } from '@tanstack/react-query';
import { meKeys } from './meKeys';
import { getMe, listDevices } from '@libs/api-js';

export const meOptions = () => {
  return queryOptions({
    queryKey: meKeys.details(),
    queryFn: async () => {
      const { data, error } = await getMe();
      if (error) throw error;
      return data;
    },
  });
};

export const devicesOptions = () => {
  return queryOptions({
    queryKey: meKeys.devices(),
    queryFn: async () => {
      const { data, error } = await listDevices();
      if (error) throw error;
      return data;
    },
  });
};
