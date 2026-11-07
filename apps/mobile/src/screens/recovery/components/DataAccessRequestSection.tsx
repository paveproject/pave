import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Icon, Row, FieldGroup, Text as NativeText } from '@expo/ui';
import { listRowBackground } from '@expo/ui/swift-ui/modifiers';
import { useFormatter, useTranslations } from 'use-intl';
import {
  useDataAccessRequestRefuseMutation,
  userDataAccessRequestCurrentOptions,
} from '@libs/query-client';
import { useTheme } from '../../../providers/ThemeProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useToast } from '../../../components/Toast';
import { Icons } from '../../../constants/icons';
import { logger } from '../../../logger';

/**
 * The owner's standing surface for refusing, under the `as-owner` sheet that
 * `usePendingActionsGate` pops - dismissing that sheet leaves the user here,
 * and the push notification lands here too.
 *
 * Refusing works during the delay **and** after access opened.
 */
export const DataAccessRequestSection = () => {
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors, mode } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: request } = useQuery(userDataAccessRequestCurrentOptions({ userId }));
  const refuse = useDataAccessRequestRefuseMutation({ userId });

  const requesterName = request?.requester.username ?? '';

  const handleRefuse = useCallback(() => {
    if (!request) return;
    Alert.alert(
      t('pages.pending_actions.data_access_request.owner.refuse_confirm_title'),
      t('pages.pending_actions.data_access_request.owner.refuse_confirm_message', {
        requesterName,
      }),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.data_access_request.owner.refuse'),
          style: 'destructive',
          onPress: () => {
            refuse.mutate(request.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('refuse data access request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, refuse, request, requesterName, toast]);

  // The only two states the owner can still act on.
  if (!request || (request.access !== 'waiting' && request.access !== 'open')) return null;

  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;
  const isOpen = request.access === 'open';

  return (
    <FieldGroup.Section>
      <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
        <Icon
          name={Icons.warning}
          size={theme.icons.sizes.md}
          color={isOpen ? colors.destructive : colors.warning}
        />
        <NativeText textStyle={{ color: colors.foreground }}>
          {t('pages.pending_actions.data_access_request.owner.title', { requesterName })}
        </NativeText>
      </Row>
      <Row
        spacing={theme.spaces.md}
        alignment="center"
        onPress={refuse.isPending ? undefined : handleRefuse}
        modifiers={rowBackground}
      >
        <Icon name={Icons.close} size={theme.icons.sizes.md} color={colors.destructive} />
        <NativeText textStyle={{ color: colors.destructive }}>
          {t('pages.pending_actions.data_access_request.owner.refuse')}
        </NativeText>
      </Row>
      <FieldGroup.SectionFooter>
        <NativeText textStyle={{ color: colors.mutedForeground }}>
          {isOpen
            ? t('pages.pending_actions.data_access_request.owner.open_body', {
                requesterName,
                expiresAt: format.dateTime(new Date(request.expiresAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })
            : t('pages.pending_actions.data_access_request.owner.waiting_body', {
                requesterName,
                approved: request.approvedContacts,
                required: request.requiredApprovals,
                releaseAt: format.dateTime(new Date(request.releaseAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
        </NativeText>
      </FieldGroup.SectionFooter>
    </FieldGroup.Section>
  );
};
