import { useCallback } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Host, Icon, Row, Spacer, FieldGroup, RNHostView, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  refreshable,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { PullToRefreshBox } from '@expo/ui/jetpack-compose';
import {
  useDataAccessRequestCancelMutation,
  useUserDataAccessRequestsCreateMutation,
} from '@libs/query-client';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useTrustedContactDataAccess } from '../../hooks/dataAccess/useOwnerDataAccess';
import { View } from '../../components/ui/view';
import { Avatar } from '../../components/ui/Avatar';
import Empty from '../../components/ui/empty';
import { useToast } from '../../components/Toast';
import { Icons } from '../../constants/icons';
import { logger } from '../../logger';

/** Spelled out rather than interpolated from `access`: `useTranslations`
 * only type-checks literal keys. */
const CLOSED_BODY_KEY = {
  refused: 'pages.settings.trusted_contact.access.closed.refused',
  failed: 'pages.settings.trusted_contact.access.closed.failed',
  expired: 'pages.settings.trusted_contact.access.closed.expired',
  cancelled: 'pages.settings.trusted_contact.access.closed.cancelled',
  // Unreachable - a waiting or open request renders its own section instead.
  waiting: 'pages.settings.trusted_contact.access.request_body',
  open: 'pages.settings.trusted_contact.access.request_body',
} as const;

/** Addressed by the `trusted_contact` row id, not the owner's user id: that
 * is what the relationship list hands out. */
const TrustedContactDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const toast = useToast();
  const { colors, theme, mode } = useTheme();

  const { relationship, request, source, isLoading, failedToCombine, refresh, isRefreshing } =
    useTrustedContactDataAccess(id);
  const ownerUserId = relationship?.owner.id;
  const ownerName = relationship?.owner.username ?? '';
  const create = useUserDataAccessRequestsCreateMutation({ userId: ownerUserId });
  const cancel = useDataAccessRequestCancelMutation();

  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;

  const handleRequest = useCallback(() => {
    Alert.alert(
      t('pages.settings.trusted_contact.access.request_confirm_title'),
      t('pages.settings.trusted_contact.access.request_confirm_message', { ownerName }),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.settings.trusted_contact.access.request'),
          onPress: () => {
            create.mutate(undefined, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('data access request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, ownerName, mode, create, toast]);

  const handleCancel = useCallback(() => {
    if (!request) return;
    Alert.alert(
      t('pages.settings.trusted_contact.access.cancel_confirm_title'),
      t('pages.settings.trusted_contact.access.cancel_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.settings.trusted_contact.access.cancel'),
          style: 'destructive',
          onPress: () => {
            cancel.mutate(request.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('cancel data access request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, cancel, request, toast]);

  const handleProtestSessions = useCallback(() => {
    router.push({
      pathname: '/trusted-contact/[id]/protest-sessions',
      params: { id },
    });
  }, [router, id]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!relationship) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          icon={Icons.peopleOff}
          title={t('pages.settings.trusted_contacts.empty.trusted_by')}
        />
      </View>
    );
  }

  const releaseAt = request ? new Date(request.releaseAt) : null;
  const isWaiting = request?.access === 'waiting';
  const isOpen = request?.access === 'open';
  // 0 when this user is the owner's only contact: no quorum to form, so the
  // delay is the whole protection. Said in words rather than "0 of 0".
  const isLoneContact = !!request && request.requiredApprovals === 0;

  const fieldGroup = (
    <FieldGroup
      style={{ backgroundColor: colors.background }}
      modifiers={
        Platform.OS === 'ios'
          ? [
              scrollContentBackground('hidden'),
              background(colors.background),
              tint(colors.foreground),
              refreshable(refresh),
            ]
          : undefined
      }
    >
      <FieldGroup.Section>
        <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
          <RNHostView matchContents>
            <Avatar uri={relationship.owner.image} size={theme.spaces['4xl']} />
          </RNHostView>
          <NativeText textStyle={{ color: colors.foreground }}>
            {relationship.owner.username ? `@${relationship.owner.username}` : ''}
          </NativeText>
          <Spacer flexible />
        </Row>
        <FieldGroup.SectionFooter>
          <NativeText textStyle={{ color: colors.mutedForeground }}>
            {t('pages.settings.trusted_contact.since', {
              date: format.dateTime(new Date(relationship.createdAt), {
                dateStyle: 'medium',
              }),
            })}
          </NativeText>
        </FieldGroup.SectionFooter>
      </FieldGroup.Section>

      {isWaiting && releaseAt ? (
        <FieldGroup.Section>
          <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
            <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
            <NativeText textStyle={{ color: colors.foreground }}>
              {t('pages.settings.trusted_contact.access.waiting')}
            </NativeText>
          </Row>
          {!isLoneContact ? (
            <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.trusted_contact.access.progress', {
                  approved: request.approvedContacts,
                  required: request.requiredApprovals,
                })}
              </NativeText>
            </Row>
          ) : null}
          <Row
            spacing={theme.spaces.md}
            alignment="center"
            onPress={cancel.isPending ? undefined : handleCancel}
            modifiers={rowBackground}
          >
            <Icon name={Icons.close} size={theme.icons.sizes.md} color={colors.destructive} />
            <NativeText textStyle={{ color: colors.destructive }}>
              {t('pages.settings.trusted_contact.access.cancel')}
            </NativeText>
          </Row>
          <FieldGroup.SectionFooter>
            <NativeText textStyle={{ color: colors.mutedForeground }}>
              {t(
                isLoneContact
                  ? 'pages.settings.trusted_contact.access.lone_contact'
                  : 'pages.settings.trusted_contact.access.waiting_body',
                {
                  ownerName,
                  releaseAt: format.dateTime(releaseAt, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                },
              )}
            </NativeText>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      ) : null}

      {isOpen ? (
        <FieldGroup.Section>
          <Row
            spacing={theme.spaces.md}
            alignment="center"
            onPress={source ? handleProtestSessions : undefined}
            modifiers={rowBackground}
          >
            <Icon name={Icons.megaphone} size={theme.icons.sizes.md} color={colors.foreground} />
            <NativeText textStyle={{ color: colors.foreground }}>
              {t('messages.protest_sessions')}
            </NativeText>
            <Spacer flexible />
            <Icon
              name={Icons.chevronRight}
              size={theme.icons.sizes.sm}
              color={colors.mutedForeground}
            />
          </Row>
          <FieldGroup.SectionFooter>
            <NativeText
              textStyle={{
                color: failedToCombine ? colors.destructive : colors.mutedForeground,
              }}
            >
              {failedToCombine
                ? t('pages.settings.trusted_contact.access.combine_failed')
                : t('pages.settings.trusted_contact.access.open_until', {
                    expiresAt: format.dateTime(new Date(request.expiresAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
            </NativeText>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      ) : null}

      {!isWaiting && !isOpen ? (
        <FieldGroup.Section>
          <Row
            spacing={theme.spaces.md}
            alignment="center"
            onPress={create.isPending ? undefined : handleRequest}
            modifiers={rowBackground}
          >
            <Icon name={Icons.lock} size={theme.icons.sizes.md} color={colors.foreground} />
            <NativeText textStyle={{ color: colors.foreground }}>
              {t('pages.settings.trusted_contact.access.request')}
            </NativeText>
          </Row>
          <FieldGroup.SectionFooter>
            <NativeText textStyle={{ color: colors.mutedForeground }}>
              {/* The last outcome, when there was one: "request access"
                  alone would read as if nothing had happened. */}
              {t(
                request
                  ? CLOSED_BODY_KEY[request.access]
                  : 'pages.settings.trusted_contact.access.request_body',
                { ownerName },
              )}
            </NativeText>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      ) : null}
    </FieldGroup>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground} colorScheme={mode}>
        {Platform.OS === 'android' ? (
          <PullToRefreshBox isRefreshing={isRefreshing} onRefresh={refresh}>
            {fieldGroup}
          </PullToRefreshBox>
        ) : (
          fieldGroup
        )}
      </Host>
    </View>
  );
};

export default TrustedContactDetailScreen;
