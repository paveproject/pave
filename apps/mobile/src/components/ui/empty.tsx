import { forwardRef } from 'react';
import { View } from 'react-native';
import { Card, CardHeader, CardTitle } from './card';
import { useTranslations } from 'use-intl';
import { Icons } from '../../constants/IconsOld';
import { useTheme } from '../../providers/ThemeProvider';
import tw from '../../lib/tw';

interface EmptyProps extends React.ComponentProps<typeof View> {
  title?: string;
  description?: string;
}

const Empty = forwardRef<View, EmptyProps>(({ title, description, children, ...props }, ref) => {
  const { colors } = useTheme();
  const t = useTranslations();
  return (
    <Card>
      <CardHeader style={tw`items-center`}>
        <Icons.Empty color={colors.foreground} />
        <CardTitle>{title || t('messages.is_empty')}</CardTitle>
      </CardHeader>
      <View
        style={[
          {
            borderColor: colors.mutedForeground,
            borderWidth: 1,
            borderStyle: 'dashed',
          },
          tw`p-4 rounded-md`,
        ]}
      >
        {children}
      </View>
    </Card>
  );
});
Empty.displayName = 'Empty';

export default Empty;
