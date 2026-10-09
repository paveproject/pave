import { useTheme } from '../../providers/ThemeProvider';
import * as React from 'react';
import { SwitchProps, Switch as SwitchRN } from 'react-native';

const Switch = React.forwardRef<React.ComponentRef<typeof SwitchRN>, SwitchProps>(
  ({ style, ...props }, ref) => {
    const { colors } = useTheme();
    return (
      <SwitchRN
        ref={ref}
        trackColor={{ true: colors.accentYellow, false: colors.mutedForeground }}
        thumbColor={colors.foreground}
        {...props}
      />
    );
  },
);
Switch.displayName = 'Switch';

export default Switch;
