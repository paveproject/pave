import { forwardRef } from 'react';
import { View } from './ui/view';
import { useTranslations } from 'use-intl';
import { useTheme } from '../providers/ThemeProvider';
import { Text, TextProps } from './ui/text';
import { Icons } from '../constants/Icons';
import { upperFirst } from 'lodash';
import { PADDING_VERTICAL } from '../theme/globals';
import tw from '../lib/tw';

interface ErrorMessageProps extends React.ComponentProps<typeof View> {
  message?: string | React.ReactNode;
  textStyle?: TextProps['style'];
}

const ErrorMessage = forwardRef<React.ComponentRef<typeof View>, ErrorMessageProps>(
  ({ message, style, textStyle }, ref) => {
    const t = useTranslations();
    const { colors } = useTheme();
    return (
      <View ref={ref} style={[tw`items-center justify-center flex-1`, style]}>
        <Icons.AlertCircle color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground }}>
          {upperFirst(t('common.messages.an_error_occurred'))}
        </Text>
        {typeof message === 'string' ? (
          <Text
            style={[
              {
                padding: PADDING_VERTICAL,
                color: colors.mutedForeground,
                textAlign: 'center',
              },
              textStyle,
            ]}
          >
            {message}
          </Text>
        ) : (
          message
        )}
      </View>
    );
  },
);
ErrorMessage.displayName = 'ErrorMessage';

export default ErrorMessage;
