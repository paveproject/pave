import { Stack } from 'expo-router';
import { useTheme } from '../../providers/ThemeProvider';

/**
 * Nested inside the `report` formSheet, whose root screen hides its own header
 * so this stack owns them: step one picks a family, step two picks a type
 * inside it. `useModalHeaderOptions` already swaps the close X for the native
 * back chevron past index 0, so neither screen wires that itself.
 */
const ReportLayout = () => {
  const { isLiquidGlassAvailable } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        ...(isLiquidGlassAvailable ? { headerStyle: { backgroundColor: 'transparent' } } : {}),
      }}
    />
  );
};

export default ReportLayout;
