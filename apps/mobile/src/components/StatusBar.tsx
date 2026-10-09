import { useTheme } from '../providers/ThemeProvider';
import { StatusBar as StatusBarNative, StatusBarProps } from 'expo-status-bar';

const StatusBar = (props: StatusBarProps) => {
  const { mode } = useTheme();
  return <StatusBarNative style={mode === 'dark' ? 'light' : 'dark'} {...props} />;
};

export default StatusBar;
