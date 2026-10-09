import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { BrandIconProps } from './type';

const Messenger = forwardRef<Svg, BrandIconProps>((props, ref) => {
  const { variant = 'colored', size = 24, ...otherProps } = props;
  void variant;
  return (
    <Svg
      ref={ref}
      id="messenger-icon"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      fill="none"
      {...otherProps}
    >
      <Path
        fill={'#0866ff'}
        d="M24,11.64c0,6.69-5.24,11.64-12,11.64-1.21,0-2.38-.16-3.47-.46-.21-.06-.44-.04-.64.05l-2.38,1.05c-.62.28-1.33-.17-1.35-.85l-.07-2.13c0-.26-.13-.51-.32-.68C1.43,18.16,0,15.14,0,11.64,0,4.95,5.24,0,12,0s12,4.95,12,11.64Z"
      />
      <Path
        fill={'#fff'}
        d="M15.26,14.99l4.18-6.46c.42-.65-.36-1.4-.99-.97l-4.36,3.01c-.15.1-.34.1-.49,0l-3.87-2.5c-.33-.21-.77-.12-.98.21l-4.18,6.46c-.42.65.36,1.4.99.97l4.36-3.01c.15-.1.34-.1.49,0l3.87,2.5c.33.21.77.12.98-.21h0Z"
      />
    </Svg>
  );
});
Messenger.displayName = 'Messenger';

export { Messenger };
