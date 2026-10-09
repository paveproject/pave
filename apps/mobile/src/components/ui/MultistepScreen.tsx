import React, { useMemo, useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Icons } from '../../constants/Icons';
import { GAP, PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../theme/globals';
import { KeyboardAwareScrollView } from './KeyboardAwareScrollView';
import tw from '../../lib/tw';
import { Button } from './Button';
import { useTranslations } from 'use-intl';

interface MultiStepScreenProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  currentStepKey?: string | number;

  onNext: () => void | Promise<void>;
  onBack?: () => void;
  canGoBack?: boolean;
  isNextDisabled?: boolean;
  isLoading?: boolean;
  nextLabel?: string;
  nextIcon?: any;
}

export const MultiStepScreen = ({
  children,
  contentContainerStyle,
  currentStepKey,
  onNext,
  onBack,
  canGoBack = false,
  isNextDisabled = false,
  isLoading = false,
  nextLabel: nextLabelProp,
  nextIcon = Icons.ChevronRight,
}: MultiStepScreenProps) => {
  const insets = useSafeAreaInsets();
  const t = useTranslations();
  const nextLabel = nextLabelProp || t('common.messages.continue');

  /* ---------------------------------- Style & Animations --------------------------------- */
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const [footerHeight, setFooterHeight] = useState(0);

  const paddingBottom = useMemo(() => footerHeight, [footerHeight]);

  const paddingLeft = useMemo(() => insets.left + PADDING_HORIZONTAL, [insets.left]);

  const paddingRight = useMemo(() => insets.right + PADDING_HORIZONTAL, [insets.right]);

  const animatedFooterStyle = useAnimatedStyle(() => {
    const kbHeight = Math.abs(keyboardHeight.value);

    return {
      bottom: kbHeight,
      paddingBottom: (kbHeight > 0 ? 0 : insets.bottom) + PADDING_VERTICAL,
    };
  });

  return (
    <>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          {
            paddingLeft: paddingLeft,
            paddingRight: paddingRight,
            paddingBottom: paddingBottom,
            gap: GAP,
            flexGrow: 1,
          },
          contentContainerStyle,
        ]}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={footerHeight + PADDING_VERTICAL}
      >
        <React.Fragment key={currentStepKey}>{children}</React.Fragment>
      </KeyboardAwareScrollView>

      <Animated.View
        onLayout={(e) => {
          setFooterHeight(e.nativeEvent.layout.height);
        }}
        style={[
          tw`absolute flex-row items-center justify-center left-0 right-0`,
          {
            gap: GAP,
            paddingLeft: paddingLeft,
            paddingRight: paddingRight,
            paddingTop: PADDING_VERTICAL,
          },
          animatedFooterStyle,
        ]}
      >
        {canGoBack && onBack && (
          <Button
            variant="muted"
            icon={Icons.ChevronLeft}
            size="lg"
            onPress={onBack}
            disabled={isLoading}
          />
        )}

        <Button
          icon={nextIcon}
          iconPosition="right"
          onPress={onNext}
          loading={isLoading}
          disabled={isNextDisabled}
          size="lg"
          containerStyle={tw`w-full shrink`}
        >
          {nextLabel}
        </Button>
      </Animated.View>
    </>
  );
};
