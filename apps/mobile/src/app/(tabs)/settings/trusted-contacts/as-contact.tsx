import { useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { trustedByOptions } from '@libs/query-client';
import type { TrustedByResponse } from '@libs/api-js';
import { useFormatter, useTranslations } from 'use-intl';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import { Avatar } from '../../../../components/ui/Avatar';
import Empty from '../../../../components/ui/empty';
import { Icons as NativeIcons } from '../../../../constants/icons';
import { useTheme } from '../../../../providers/ThemeProvider';
import tw from '../../../../lib/tw';

const TrustedByRowItem = ({ item }: { item: TrustedByResponse }) => {
  const t = useTranslations();
  const format = useFormatter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spaces.sm,
        paddingVertical: theme.spaces.sm,
        paddingLeft: insets.left + theme.spaces.horizontal,
        paddingRight: insets.right + theme.spaces.horizontal,
      }}
    >
      <Avatar uri={item.owner.image} size={theme.spaces['4xl']} />
      <Text style={{ flex: 1, fontWeight: '600' }}>
        {item.owner.username ?? t('messages.no_username')}
      </Text>
      <Text textColor="muted">
        {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' })}
      </Text>
    </View>
  );
};

const TrustedByScreen = () => {
  const t = useTranslations();
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data, isPending, isRefetching, refetch } = useQuery(trustedByOptions());

  const contacts = useMemo(() => data ?? [], [data]);

  const padding = {
    paddingTop: theme.spaces.vertical,
    paddingLeft: insets.left + theme.spaces.horizontal,
    paddingRight: insets.right + theme.spaces.horizontal,
    paddingBottom: insets.bottom + theme.spaces.vertical,
  };

  const renderItem = useCallback(
    ({ item }: { item: TrustedByResponse }) => <TrustedByRowItem item={item} />,
    [],
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
          title={t('pages.settings.trusted_contacts.empty.trusted_by')}
        />
      </ScrollView>
    );
  }

  return (
    <AnimatedLegendList
      data={contacts}
      keyExtractor={(item) => item.id}
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
