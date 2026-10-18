import { useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Button as UIButton } from '@expo/ui';
import { pendingActionsOptions, trustedByOptions } from '@libs/query-client';
import type { MeTrustedContactsAsContactResponse } from '@libs/api-js';
import { useFormatter, useTranslations } from 'use-intl';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import { Avatar } from '../../../../components/ui/Avatar';
import Empty from '../../../../components/ui/empty';
import { Icons as NativeIcons } from '../../../../constants/icons';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useDeviceId } from '../../../../hooks/useDeviceId';
import tw from '../../../../lib/tw';

interface Row {
  readonly contact: MeTrustedContactsAsContactResponse;
  // The matching `recovery_request_contact` pending action's own id, if
  // this owner closed that formSheet without approving/declining - same
  // "still shows up as a pending action for us" reasoning as
  // `settings/devices/index.tsx`'s own `canApprove`, matched here by
  // owner id instead of device id (one owner can only have one
  // in-flight request we're asked about, so this is still 1:1).
  readonly reviewActionId: string | undefined;
}

const TrustedByRowItem = ({ row, onReview }: { row: Row; onReview: (id: string) => void }) => {
  const { contact: item, reviewActionId } = row;
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors, mode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spaces.sm,
        height: theme.cards.heights.md,
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
      }}
    >
      <Avatar uri={item.owner.image} size={theme.icons.sizes.xl} />
      <Text style={{ flex: 1, fontWeight: '600' }}>{item.owner.username}</Text>
      {reviewActionId ? (
        <Host matchContents seedColor={colors.warning} colorScheme={mode}>
          <UIButton
            variant="outlined"
            label={t('messages.review')}
            onPress={() => onReview(reviewActionId)}
          />
        </Host>
      ) : (
        <Text textColor="muted">
          {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' })}
        </Text>
      )}
    </View>
  );
};

const TrustedByScreen = () => {
  const t = useTranslations();
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const deviceId = useDeviceId();
  const { data, isPending, isRefetching, refetch } = useQuery(
    trustedByOptions(deviceId ?? undefined),
  );
  // Same source `usePendingActionsGate` reads - this contact only shows
  // up here as a `recovery_request_contact` item once the server has
  // confirmed there's still something to approve/decline (see
  // `pending_actions::get_pending_actions`).
  const { data: pendingActions } = useQuery(pendingActionsOptions());

  const reviewActionIdByOwnerId = useMemo(
    () =>
      new Map(
        (pendingActions ?? [])
          .filter((action) => action.kind === 'recovery_request_contact')
          .map((action) => [action.owner.id, action.id] as const),
      ),
    [pendingActions],
  );

  const rows: Row[] = useMemo(
    () =>
      (data ?? []).map((contact) => ({
        contact,
        reviewActionId: reviewActionIdByOwnerId.get(contact.owner.id),
      })),
    [data, reviewActionIdByOwnerId],
  );

  const handleReview = useCallback(
    (id: string) => {
      router.push({ pathname: '/validation/recovery-request/[id]', params: { id } });
    },
    [router],
  );

  const padding = {
    paddingTop: theme.spaces.vertical,
    paddingLeft: insets.left + theme.spaces.horizontal,
    paddingRight: insets.right + theme.spaces.horizontal,
    paddingBottom: insets.bottom + theme.spaces.vertical,
  };

  const renderItem = useCallback(
    ({ item }: { item: Row }) => <TrustedByRowItem row={item} onReview={handleReview} />,
    [handleReview],
  );

  if (isPending) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          ...padding,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (!rows.length) {
    return (
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          ...padding,
        }}
        scrollIndicatorInsets={{
          bottom: insets.bottom,
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <Empty
          icon={NativeIcons.peopleOff}
          title={t('pages.settings.trusted_contacts.empty.trusted_by')}
        />
      </ScrollView>
    );
  }

  return (
    <AnimatedLegendList
      data={rows}
      keyExtractor={(row) => row.contact.id}
      renderItem={renderItem}
      itemLayoutAnimation={LinearTransition.duration(theme.animations.durations.md)}
      ItemSeparatorComponent={() => (
        <View
          style={[
            tw`rounded-full`,
            {
              height: 1,
              backgroundColor: colors.muted,
              marginLeft: padding.paddingLeft,
              marginRight: padding.paddingRight,
              marginVertical: theme.spaces.sm,
            },
          ]}
        />
      )}
      refreshing={isRefetching}
      onRefresh={refetch}
      contentContainerStyle={{
        paddingTop: padding.paddingTop,
        paddingBottom: padding.paddingBottom,
      }}
      scrollIndicatorInsets={{
        bottom: insets.bottom,
      }}
    />
  );
};

export default TrustedByScreen;
