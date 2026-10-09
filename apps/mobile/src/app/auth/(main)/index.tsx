import { Button } from '../../../components/ui/Button';
import { View } from '../../../components/ui/view';
import { Icons } from '../../../constants/Icons';
import tw from '../../../lib/tw';
import { useTheme } from '../../../providers/ThemeProvider';
import { GAP, GAP_XL, PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../../theme/globals';
import { Href, Link, Stack } from 'expo-router';
import { upperFirst } from 'lodash';
import { ScrollView, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslations } from 'use-intl';
import { LinearGradient } from 'expo-linear-gradient';
import Color from 'color';
import { Text } from '../../../components/ui/text';
import { getMediaDetails } from '../../../components/utils/getMediaDetails';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useMemo, useState } from 'react';
import { LoopCarousel } from '../../../components/ui/LoopCarousel';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { uiBackgroundsOptions } from '../../../api/ui/uiOptions';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';
import { UiBackground } from '@libs/api-js';

const AuthHeader = ({
  onBackgroundChange,
}: {
  onBackgroundChange: (background: UiBackground | null) => void;
}) => {
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const bgColor = useMemo(() => Color(colors.background).rgb().object(), [colors.background]);
  const { data } = useQuery(uiBackgroundsOptions());
  return (
    <View
      style={[
        tw`items-center justify-end`,
        {
          paddingHorizontal: PADDING_HORIZONTAL,
          paddingVertical: PADDING_VERTICAL,
          paddingTop: headerHeight,
          height: SCREEN_HEIGHT * 0.5,
        },
      ]}
    >
      <Animated.View style={tw`absolute inset-0`}>
        {data && (
          <LoopCarousel
            items={data}
            containerStyle={tw`flex-1`}
            renderItem={(item) => (
              <Image source={item.localUri} contentFit="cover" style={tw`absolute inset-0`} />
            )}
            onChange={onBackgroundChange}
          />
        )}
        <LinearGradient
          style={tw`absolute inset-0`}
          colors={[
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.3)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.4)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.5)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.6)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.6)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 0.8)`,
            `rgba(${bgColor.r}, ${bgColor.g}, ${bgColor.b}, 1)`,
          ]}
        />
      </Animated.View>
      <Icons.app.logo color={colors.accentYellow} width={SCREEN_WIDTH * 0.75} />
    </View>
  );
};

const AuthScreen = () => {
  const t = useTranslations();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeBackground, setActiveBackground] = useState<UiBackground | null>(null);
  const modalHeaderOptions = useModalHeaderOptions();
  const activeDetails = useMemo(() => {
    switch (activeBackground?.type) {
      case 'movie':
        return activeBackground
          ? getMediaDetails({ type: 'movie', media: activeBackground.media })
          : undefined;
      case 'tv_series':
        return activeBackground
          ? getMediaDetails({ type: 'tv_series', media: activeBackground.media })
          : undefined;
      default:
        return undefined;
    }
  }, [activeBackground]);

  const routes = useMemo(
    (): { name: string; href: Href }[] => [
      { name: upperFirst(t('common.messages.login')), href: { pathname: '/auth/login' } },
      { name: upperFirst(t('common.messages.signup')), href: { pathname: '/auth/signup' } },
      { name: upperFirst(t('common.messages.show_me_around')), href: { pathname: '/onboarding' } },
    ],
    [t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          ...modalHeaderOptions,
          headerTitle: () => <></>,
        }}
      />
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={[{ gap: GAP_XL, paddingBottom: insets.bottom + PADDING_VERTICAL }]}
        stickyHeaderIndices={[0]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <AuthHeader onBackgroundChange={setActiveBackground} />
        <View style={{ gap: GAP, paddingHorizontal: PADDING_HORIZONTAL }}>
          {routes.map((route, index) => (
            <Link key={index} href={route.href} asChild>
              <Button variant="muted" textStyle={tw`font-semibold`}>
                {route.name}
              </Button>
            </Link>
          ))}
        </View>
        <View style={{ paddingHorizontal: PADDING_HORIZONTAL }}>
          {activeDetails && (
            <Animated.Text
              key={activeBackground?.id}
              entering={FadeIn}
              exiting={FadeOut}
              style={[tw`text-center`, { color: colors.mutedForeground }]}
            >
              {t.rich('common.messages.artwork_from', {
                source: activeDetails.title!,
                important: (chunk) => (
                  <Text textColor="default" style={tw`font-semibold`}>
                    {chunk}
                  </Text>
                ),
              })}
            </Animated.Text>
          )}
        </View>
      </ScrollView>
    </>
  );
};

export default AuthScreen;
