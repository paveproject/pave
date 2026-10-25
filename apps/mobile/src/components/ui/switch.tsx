import { Platform } from 'react-native';
import { Switch as ExpoSwitch, type SwitchProps as ExpoSwitchProps } from '@expo/ui';
import { tint } from '@expo/ui/swift-ui/modifiers';
import { useTheme } from '../../providers/ThemeProvider';

export type SwitchProps = ExpoSwitchProps;

export const Switch = ({ modifiers, ...props }: SwitchProps) => {
  const { colors } = useTheme();

  if (Platform.OS !== 'ios') {
    return <ExpoSwitch {...props} modifiers={modifiers} />;
  }

  return <ExpoSwitch {...props} modifiers={[tint(colors.success), ...(modifiers ?? [])]} />;
};
