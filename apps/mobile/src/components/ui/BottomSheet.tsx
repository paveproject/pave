import { Component } from 'react';
import { useTheme } from '../../providers/ThemeProvider';
import GBottomSheet, { BottomSheetProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default class BottomSheet extends Component<BottomSheetProps> {
  render() {
    return <ThemedBottomSheet {...this.props} />;
  }
}

const ThemedBottomSheet = ({
  backgroundStyle,
  handleIndicatorStyle,
  ...props
}: BottomSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <GBottomSheet
      topInset={insets.top}
      handleIndicatorStyle={[{ backgroundColor: colors.mutedForeground }, handleIndicatorStyle]}
      backgroundStyle={[{ backgroundColor: colors.muted }, backgroundStyle]}
      {...props}
    >
      {props.children}
    </GBottomSheet>
  );
};
