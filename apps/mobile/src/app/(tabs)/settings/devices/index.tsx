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
import { devicesOptions, useRevokeDeviceMutation } from '@libs/query-client';
import type { DeviceResponse } from '@libs/api-js';
import { useFormatter, useTranslations } from 'use-intl';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import {
  SwipeableActionsRow,
  type SwipeAction,
} from '../../../../components/ui/swippeable/SwipeableActionsRow';
import Empty from '../../../../components/ui/empty';
import { Icons as NativeIcons } from '../../../../constants/icons';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useToast } from '../../../../components/Toast';
import { useDeviceId } from '../../../../hooks/useDeviceId';
import { logger } from '../../../../logger';
import tw from '../../../../lib/tw';
import { scheduleOnRN } from 'react-native-worklets';

interface Row {
  readonly device: DeviceResponse;
  readonly isThisDevice: boolean;
  readonly isLeaving: boolean;
}

const DeviceRow = ({
  row,
  onLeft,
  onRequestRemove,
}: {
  row: Row;
  onLeft: (id: string) => void;
  onRequestRemove: (id: string) => void;
}) => {
  const { device, isThisDevice, isLeaving } = row;
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const visibility = useSharedValue(1);

  useEffect(() => {
    if (isLeaving) {
      // eslint-disable-next-line react-hooks/immutability, react-compiler/react-compiler -- Reanimated shared value mutation
      visibility.value = withTiming(0, { duration: theme.animations.durations.md }, (finished) => {
        if (finished) scheduleOnRN(onLeft, device.id);
      });
    }
  }, [isLeaving, device.id, onLeft, visibility, theme.animations.durations.md]);

  const style = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [{ scale: visibility.value }],
  }));

  const actions: SwipeAction[] = isThisDevice
    ? []
    : [
        {
          label: t('messages.remove'),
          icon: NativeIcons.trash,
          iconColor: {
            color: colors.destructiveForeground,
            backgroundColor: colors.destructive,
          },
          onPress: () => onRequestRemove(device.id),
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
            height: theme.cards.heights.md,
          }}
        >
          <Text style={{ flex: 1, fontWeight: '600' }}>
            {isThisDevice
              ? t('pages.settings.devices.this_device')
              : device.deviceType === 'ios'
                ? 'iOS'
                : device.deviceType === 'android'
                  ? 'Android'
                  : 'Web'}
          </Text>
          <Text textColor="muted">
            {format.dateTime(new Date(device.createdAt), { dateStyle: 'medium' })}
          </Text>
        </View>
      </SwipeableActionsRow>
    </Animated.View>
  );
};

const MyDevicesScreen = () => {
  const t = useTranslations();
  const { theme, colors, mode } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const thisDeviceId = useDeviceId();

  const { data, isPending, isRefetching, refetch } = useQuery(devicesOptions());
  const revoke = useRevokeDeviceMutation();

  const devices = useMemo(() => data ?? [], [data]);

  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());

  const rows: Row[] = useMemo(
    () =>
      devices.map((device) => ({
        device,
        isThisDevice: device.id === thisDeviceId,
        isLeaving: leavingIds.has(device.id),
      })),
    [devices, thisDeviceId, leavingIds],
  );

  const handleRequestRemove = useCallback(
    (id: string) => {
      Alert.alert(
        t('pages.settings.devices.revoke_confirm_title'),
        t('pages.settings.devices.revoke_confirm_message'),
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
        logger.error('revoke device error', { error });
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
    ({ item }: { item: Row }) => (
      <DeviceRow row={item} onLeft={handleRowLeft} onRequestRemove={handleRequestRemove} />
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

  if (!devices.length) {
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
        <Empty icon={NativeIcons.device} title={t('pages.settings.devices.empty')} />
      </ScrollView>
    );
  }

  return (
    <AnimatedLegendList
      data={rows}
      keyExtractor={(row) => row.device.id}
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

export default MyDevicesScreen;
