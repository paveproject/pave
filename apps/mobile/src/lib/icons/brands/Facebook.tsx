import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { BrandIconProps } from './type';

const Facebook = forwardRef<Svg, BrandIconProps>((props, ref) => {
  const { variant = 'colored', size = 24, ...otherProps } = props;
  void variant;
  return (
    <Svg
      ref={ref}
      id="facebook-icon"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      fill="none"
      {...otherProps}
    >
      <Path
        d="M24,12C24,5.37,18.63,0,12,0S0,5.37,0,12C0,17.63,3.87,22.35,9.1,23.65v-7.98h-2.47v-3.67h2.47v-1.58c0-4.08,1.85-5.98,5.86-5.98.76,0,2.07.15,2.61.3v3.32c-.28-.03-.78-.04-1.39-.04-1.97,0-2.73.75-2.73,2.68v1.3h3.92l-.67,3.67h-3.25v8.25c5.94-.72,10.55-5.78,10.55-11.91"
        fill={'#0866ff'}
      />
      <Path
        d="M16.7,15.67l.67-3.67h-3.92v-1.3c0-1.94.76-2.68,2.73-2.68.61,0,1.1.01,1.39.04v-3.32c-.54-.15-1.85-.3-2.61-.3-4.01,0-5.86,1.89-5.86,5.98v1.58h-2.47v3.67h2.47v7.98c.93.23,1.9.35,2.9.35.49,0,.98-.03,1.45-.09v-8.25h3.25Z"
        fill={'#fff'}
      />
    </Svg>
  );
});
Facebook.displayName = 'Facebook';

export { Facebook };
