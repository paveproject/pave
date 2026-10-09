import { forwardRef } from 'react';
import { KeyboardAwareScrollView as RNKeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface KeyboardAwareScrollViewProps
  extends React.ComponentPropsWithoutRef<typeof RNKeyboardAwareScrollView> {
  addToolbarOffset?: boolean;
}

export const KeyboardAwareScrollView = forwardRef<
  React.ComponentRef<typeof RNKeyboardAwareScrollView>,
  KeyboardAwareScrollViewProps
>(({ bottomOffset: bottomOffsetProps, addToolbarOffset = true, ...props }, ref) => {
  const bottomOffset = (bottomOffsetProps ?? 0) + (addToolbarOffset ? 62 : 0);
  return <RNKeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} {...props} />;
});
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';
