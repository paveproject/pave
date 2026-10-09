import { NativeStackNavigationOptions, useNavigation, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { upperFirst } from 'lodash';
import { Button } from '../components/ui/Button';
import { Icons } from '../constants/Icons';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { useTheme } from '../providers/ThemeProvider';
import tw from '../lib/tw';

export const useModalHeaderOptions = ({
  isPending = false,
  forceCross = false,
  confirmExit = false,
}: {
  isPending?: boolean;
  forceCross?: boolean;
  confirmExit?:
    | boolean
    | {
        confirmTitle?: string;
        confirmMessage?: string;
        continueEditingLabel?: string;
        ignoreLabel?: string;
      };
} = {}): Partial<NativeStackNavigationOptions> => {
  const navigation = useNavigation();
  const router = useRouter();
  const t = useTranslations();
  const { mode } = useTheme();

  const shouldShowCross = forceCross || navigation.getState()?.index === 0;

  const handleExit = useCallback(() => {
    if (confirmExit) {
      Alert.alert(
        typeof confirmExit === 'object' && confirmExit.confirmTitle
          ? confirmExit.confirmTitle
          : upperFirst(t('common.messages.are_u_sure')),
        typeof confirmExit === 'object' && confirmExit.confirmMessage
          ? confirmExit.confirmMessage
          : upperFirst(t('common.messages.do_you_really_want_to_cancel_change', { count: 2 })),
        [
          {
            text:
              typeof confirmExit === 'object' && confirmExit.continueEditingLabel
                ? confirmExit.continueEditingLabel
                : upperFirst(t('common.messages.continue_editing')),
          },
          {
            text:
              typeof confirmExit === 'object' && confirmExit.ignoreLabel
                ? confirmExit.ignoreLabel
                : upperFirst(t('common.messages.ignore')),
            onPress: () => router.dismiss(),
            style: 'destructive',
          },
        ],
        { userInterfaceStyle: mode },
      );
    } else {
      router.dismiss();
    }
  }, [confirmExit, router, t, mode]);

  return useMemo(
    (): Partial<NativeStackNavigationOptions> =>
      shouldShowCross
        ? {
            headerLeft: () => {
              return (
                <Button
                  variant="muted"
                  size="icon"
                  icon={Icons.X}
                  disabled={isPending}
                  onPress={handleExit}
                  style={tw`rounded-full`}
                />
              );
            },
            unstable_headerLeftItems: (props) => {
              return [
                {
                  type: 'button',
                  label: upperFirst(t('common.messages.cancel')),
                  onPress: handleExit,
                  tintColor: props.tintColor,
                  disabled: isPending,
                  icon: {
                    name: 'xmark',
                    type: 'sfSymbol',
                  },
                },
              ];
            },
          }
        : {},
    [handleExit, isPending, t, shouldShowCross],
  );
};
