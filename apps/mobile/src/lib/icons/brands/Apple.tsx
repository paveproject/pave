import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { BrandIconProps } from './type';

const Apple = forwardRef<Svg, BrandIconProps>((props, ref) => {
  const { variant = 'light', size = 24, ...otherProps } = props;
  const fill = variant === 'dark' ? '#FFFFFF' : '#000000';
  return (
    <Svg
      ref={ref}
      id="apple-icon"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      fill="none"
      {...otherProps}
    >
      <Path
        d="M21.15,8.18c-.14.11-2.6,1.49-2.6,4.57,0,3.56,3.13,4.82,3.22,4.85-.01.08-.5,1.73-1.65,3.41-1.03,1.48-2.1,2.95-3.73,2.95s-2.05-.95-3.94-.95-2.49.98-3.98.98-2.53-1.37-3.73-3.05c-1.39-1.97-2.51-5.04-2.51-7.95,0-4.67,3.03-7.14,6.02-7.14,1.59,0,2.91,1.04,3.91,1.04s2.43-1.1,4.23-1.1c.68,0,3.14.06,4.76,2.38h0ZM15.53,3.83c.75-.89,1.27-2.11,1.27-3.34,0-.17-.01-.34-.05-.48-1.21.05-2.66.81-3.53,1.82-.68.78-1.32,2.01-1.32,3.25,0,.19.03.37.05.43.08.01.2.03.33.03,1.09,0,2.46-.73,3.25-1.71h0Z"
        fill={fill}
      />
    </Svg>
  );
});
Apple.displayName = 'Apple';

export { Apple };
