import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { Icon, Row, FieldGroup, Text as NativeText } from '@expo/ui';
import { listRowBackground } from '@expo/ui/swift-ui/modifiers';
import { useFormatter, useNow, useTranslations } from 'use-intl';
import type { MeRecoveryRequestsResponse } from '@libs/api-js';
import { useCancelRecoveryRequestMutation } from '@libs/query-client';
import { useTheme } from '../../../providers/ThemeProvider';
import { useToast } from '../../../components/Toast';
import { logger } from '../../../logger';
import { Icons } from '../../../constants/icons';
import { useRecoveryOutcome } from '../../../hooks/sync/useRecoveryOutcome';

interface RecoveryProgressSectionProps {
  request: MeRecoveryRequestsResponse;
}

/**
 * `FieldGroup`-section version of what used to be
 * `components/pending-actions/RecoveryRequestProgress` - its own
 * `settings/recovery` screen, nothing left to decide once a request is
 * in flight, just progress to watch (counts only, deliberately never
 * *which* contact responded - see `MeRecoveryRequestsResponse`'s own doc
 * comment) and the option to cancel. Pulled out of `SettingsRecovery`
 * since this is the piece most likely to grow (e.g. a richer progress
 * indicator) independently of the rest of the screen.
 */
export const RecoveryProgressSection = ({ request }: RecoveryProgressSectionProps) => {
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors, mode } = useTheme();
  const toast = useToast();
  const now = useNow();
  const cancel = useCancelRecoveryRequestMutation();
  const { isImpossible } = useRecoveryOutcome(request);

  const releaseAt = new Date(request.releaseAt);
  const isReleased = now.getTime() >= releaseAt.getTime();
  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;

  const handleCancel = useCallback(() => {
    Alert.alert(
      t('pages.pending_actions.own_device.recovery.cancel_confirm_title'),
      t('pages.pending_actions.own_device.recovery.cancel_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.own_device.recovery.cancel'),
          style: 'destructive',
          onPress: () => {
            cancel.mutate(request.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('cancel recovery request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, cancel, request.id, toast]);

  return (
    <>
      <FieldGroup.Section>
        <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
          <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
          <NativeText textStyle={{ color: colors.foreground }}>
            {t('pages.pending_actions.own_device.recovery.title')}
          </NativeText>
        </Row>
        <FieldGroup.SectionFooter>
          <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
            {isReleased
              ? t('pages.pending_actions.own_device.recovery.waiting_shares_body')
              : t('pages.pending_actions.own_device.recovery.delay_body', {
                  releaseAt: format.dateTime(releaseAt, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
          </NativeText>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>

      <FieldGroup.Section>
        <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
          <NativeText textStyle={{ color: colors.foreground }}>
            {t('pages.pending_actions.own_device.recovery.progress', {
              approved: request.approvedContacts,
              declined: request.declinedContacts,
              total: request.totalContacts,
            })}
          </NativeText>
        </Row>
        <Row
          spacing={theme.spaces.md}
          alignment="center"
          onPress={cancel.isPending ? undefined : handleCancel}
          modifiers={rowBackground}
        >
          <Icon name={Icons.close} size={theme.icons.sizes.md} color={colors.destructive} />
          <NativeText textStyle={{ color: colors.destructive }}>
            {t('pages.pending_actions.own_device.recovery.cancel')}
          </NativeText>
        </Row>
        {isImpossible && (
          <FieldGroup.SectionFooter>
            <NativeText textStyle={{ color: colors.destructive, textAlign: 'center' }}>
              {t('pages.pending_actions.own_device.recovery.impossible')}
            </NativeText>
          </FieldGroup.SectionFooter>
        )}
      </FieldGroup.Section>
    </>
  );
};
