import { forwardRef } from 'react';
import { View } from '../ui/view';
import { Text } from '../ui/text';
import tw from '../../lib/tw';
import { useRouter } from 'expo-router';
import { Button } from '../ui/Button';
import { Icons } from '../../constants/Icons';

interface HeaderProps extends React.ComponentProps<typeof View> {
  right?: string | React.ReactNode;
  rightProps?: React.ComponentProps<typeof Text>;
  left?: string | React.ReactNode;
  leftProps?: React.ComponentProps<typeof Text>;
  backButton?: boolean;
}

const Header = forwardRef<React.ComponentRef<typeof View>, HeaderProps>(
  ({ right, rightProps, left, leftProps, backButton = true, style, children, ...props }, ref) => {
    const router = useRouter();
    return (
      <View ref={ref} style={[tw`flex-row justify-between items-center px-4`, style]} {...props}>
        <View style={tw`flex-row items-center gap-2`}>
          {backButton && router.canGoBack() && (
            <Button
              variant="ghost"
              icon={Icons.ChevronLeft}
              size="icon"
              onPress={() => router.back()}
            />
          )}
          {typeof right === 'string' ? (
            <Text variant="title" numberOfLines={1} {...rightProps}>
              {right}
            </Text>
          ) : (
            right
          )}
        </View>
        {children}
        {typeof left === 'string' ? (
          <Text variant="title" numberOfLines={1} {...leftProps}>
            {left}
          </Text>
        ) : (
          left
        )}
      </View>
    );
  },
);
Header.displayName = 'Header';

export default Header;
