import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trustedContactsOptions, useRevokeTrustedContactMutation } from '@libs/query-client';
import type { TrustedContactResponse } from '@libs/api-js';
import { useFormatter, useTranslations } from 'use-intl';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import { Avatar } from '../../../../components/ui/Avatar';
import {
  SwipeableActionsRow,
  type SwipeAction,
} from '../../../../components/ui/swippeable/SwipeableActionsRow';
import Empty from '../../../../components/ui/empty';
import { Icons as NativeIcons } from '../../../../constants/icons';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useToast } from '../../../../components/Toast';
import { logger } from '../../../../logger';
import tw from '../../../../lib/tw';
import { scheduleOnRN } from 'react-native-worklets';

interface ContactRow {
  readonly contact: TrustedContactResponse;
  readonly isLeaving: boolean;
}

const TrustedContactRow = ({
  row,
  onLeft,
  onRequestRemove,
}: {
  row: ContactRow;
  onLeft: (id: string) => void;
  onRequestRemove: (id: string) => void;
}) => {
  const { contact, isLeaving } = row;
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const visibility = useSharedValue(1);

  useEffect(() => {
    if (isLeaving) {
      // eslint-disable-next-line react-hooks/immutability, react-compiler/react-compiler -- Reanimated shared value mutation
      visibility.value = withTiming(0, { duration: theme.animations.durations.md }, (finished) => {
        if (finished) scheduleOnRN(onLeft, contact.id);
      });
    }
  }, [isLeaving, contact.id, onLeft, visibility, theme.animations.durations.md]);

  const style = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [{ scale: visibility.value }],
  }));

  const actions: SwipeAction[] = [
    {
      label: t('messages.remove'),
      icon: NativeIcons.trash,
      iconColor: {
        color: colors.destructiveForeground,
        backgroundColor: colors.destructive,
      },
      onPress: () => onRequestRemove(contact.id),
    },
  ];

  return (
    <Animated.View style={style}>
      <SwipeableActionsRow
        actionsRight={actions}
        style={{
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spaces.sm,
            paddingVertical: theme.spaces.sm,
          }}
        >
          <Avatar uri={contact.contact?.image} size={theme.spaces['4xl']} />
          <Text style={{ flex: 1, fontWeight: '600' }}>
            {contact.contact?.username ?? t('messages.no_username')}
          </Text>
          <Text textColor="muted">
            {format.dateTime(new Date(contact.createdAt), { dateStyle: 'medium' })}
          </Text>
        </View>
      </SwipeableActionsRow>
    </Animated.View>
  );
};

const MyTrustedContactsScreen = () => {
  const t = useTranslations();
  const { theme, colors, mode } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const { data, isPending, isRefetching, refetch } = useQuery(trustedContactsOptions());
  const revoke = useRevokeTrustedContactMutation();

  const contacts = useMemo(() => data?.filter((c) => c.status === 'accepted') ?? [], [data]);

  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  const rows: ContactRow[] = useMemo(
    () => contacts.map((contact) => ({ contact, isLeaving: leavingIds.has(contact.id) })),
    [contacts, leavingIds],
  );

  const handleRequestRemove = useCallback(
    (id: string) => {
      Alert.alert(
        t('pages.settings.trusted_contacts.revoke_confirm_title'),
        t('pages.settings.trusted_contacts.revoke_confirm_message'),
        [
          { text: t('messages.cancel'), style: 'cancel' },
          {
            text: t('messages.remove'),
            style: 'destructive',
            onPress: () => setLeavingIds((prev) => new Set(prev).add(id)),
          },
        ],
        { userInterfaceStyle: mode },
      );
    },
    [t, mode],
  );

  const handleRowLeft = useCallback(
    async (id: string) => {
      try {
        await revoke.mutateAsync(id);
      } catch (error) {
        toast.error(t('messages.an_error_occurred'));
        logger.error('revoke trusted contact error', { error });
      } finally {
        setLeavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [revoke, t, toast],
  );

  const padding = {
    paddingTop: theme.spaces.vertical,
    paddingLeft: insets.left + theme.spaces.horizontal,
    paddingRight: insets.right + theme.spaces.horizontal,
    paddingBottom: insets.bottom + theme.spaces.vertical,
  };

  const renderItem = useCallback(
    ({ item }: { item: ContactRow }) => (
      <TrustedContactRow row={item} onLeft={handleRowLeft} onRequestRemove={handleRequestRemove} />
    ),
    [handleRowLeft, handleRequestRemove],
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

  if (!contacts.length) {
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
          title={t('pages.settings.trusted_contacts.empty.mine')}
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

export default MyTrustedContactsScreen;
