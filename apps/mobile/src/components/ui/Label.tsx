import tw from '../../lib/tw';
import * as React from 'react';
import { Text, TextProps } from './text';

const Label = React.forwardRef<React.ComponentRef<typeof Text>, TextProps>(
  ({ style, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        style={[
          tw.style(
            'text-sm native:text-base font-medium leading-none web:peer-disabled:cursor-not-allowed web:peer-disabled:opacity-70',
          ),
          style,
        ]}
        {...props}
      />
    );
  },
);
Label.displayName = 'Label';

export { Label };
