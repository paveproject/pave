import {
  sendOtp,
  verifyOtp,
  sendChangeEmailOtp,
  verifyChangeEmailOtp,
  AuthOtpSendRequest,
  AuthOtpVerifyRequest,
  AuthOtpSendChangeEmailRequest,
  AuthOtpVerifyChangeEmailRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meKeys } from '../me/meKeys';

export const useSendOtpMutation = () => {
  return useMutation({
    mutationFn: async (body: AuthOtpSendRequest) => {
      const { data, error } = await sendOtp({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

export const useVerifyOtpMutation = () => {
  return useMutation({
    mutationFn: async (body: AuthOtpVerifyRequest) => {
      const { data, error } = await verifyOtp({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

export const useSendChangeEmailOtpMutation = () => {
  return useMutation({
    mutationFn: async (body: AuthOtpSendChangeEmailRequest) => {
      const { data, error } = await sendChangeEmailOtp({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

export const useVerifyChangeEmailOtpMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AuthOtpVerifyChangeEmailRequest) => {
      const { data, error } = await verifyChangeEmailOtp({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meKeys.details() });
    },
  });
};
