import { toast, Toaster as SNToaster } from 'sonner-native';
import { useTheme } from '../../providers/ThemeProvider';
import { createContext, use, useCallback } from 'react';
import { ExternalToast, ToastAction } from './types';
import { Button } from '../ui/Button';
import * as Haptics from 'expo-haptics';

type HapticType = 'none' | 'success' | 'error' | 'warning';

type ExternalToastCustom = ExternalToast & {
  haptic?: HapticType;
};

type ToastContextProps = {
  success: (message: string, opts?: ExternalToastCustom) => void;
  error: (message: string, opts?: ExternalToastCustom) => void;
  info: (message: string, opts?: ExternalToastCustom) => void;
  warning: (message: string, opts?: ExternalToastCustom) => void;
  dismiss: (id?: string | number | undefined) => string | number | undefined;
  wiggle: (id: string | number) => void;
};

export const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const { success, error, info, warning, dismiss, wiggle } = toast;

  const triggerHaptic = useCallback((type: HapticType) => {
    if (type === 'none') return;

    switch (type) {
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
    }
  }, []);

  const renderAction = useCallback((action?: React.ReactNode | ToastAction) => {
    if (!action) return undefined;

    const isToastAction = (obj: any): obj is ToastAction => {
      return obj && typeof obj === 'object' && 'label' in obj && 'onClick' in obj;
    };

    if (isToastAction(action)) {
      return <Button onPress={action.onClick}>{action.label}</Button>;
    }

    return action;
  }, []);

  const withAction = useCallback(
    (fn: (message: string, options: ExternalToast) => string | number, defaultHaptic: HapticType) =>
      (message: string, opts?: ExternalToastCustom) => {
        const hapticType = opts?.haptic ?? defaultHaptic;
        if (hapticType !== 'none') triggerHaptic(hapticType);

        const { haptic: _haptic, ...restOpts } = opts || {};

        const id = fn(message, {
          ...restOpts,
          action: renderAction(restOpts?.action),
          onPress: () => {
            restOpts?.onPress?.();
            dismiss(id);
          },
        });

        return id;
      },
    [renderAction, triggerHaptic, dismiss],
  );

  return (
    <ToastContext.Provider
      value={{
        ...toast,
        success: withAction(success, 'success'),
        error: withAction(error, 'error'),
        info: withAction(info, 'none'),
        warning: withAction(warning, 'warning'),
        dismiss: dismiss,
        wiggle: wiggle,
      }}
    >
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
};

export const Toaster = ({
  pauseWhenPageIsHidden = true,
  closeButton = true,
  duration = 2000,
  styles,
  ...props
}: React.ComponentProps<typeof SNToaster>) => {
  const { colors } = useTheme();

  return (
    <SNToaster
      pauseWhenPageIsHidden={pauseWhenPageIsHidden}
      closeButton={closeButton}
      duration={duration}
      styles={{
        toast: {
          backgroundColor: colors.toast,
        },
        title: {
          color: colors.foreground,
        },
        description: {
          color: colors.foreground,
        },
        ...styles,
      }}
      {...props}
    />
  );
};

export function useToast() {
  const context = use(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
