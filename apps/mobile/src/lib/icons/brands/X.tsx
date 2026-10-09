import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';
import { BrandIconProps } from './type';

const X = forwardRef<Svg, BrandIconProps>((props, ref) => {
  const { variant = 'light', size = 24, ...otherProps } = props;
  const fill = variant === 'dark' ? '#FFFFFF' : '#000000';
  return (
    <Svg
      ref={ref}
      id="x-icon"
      height={size}
      width={size}
      viewBox="0 0 24 24"
      fill="none"
      {...otherProps}
    >
      <Path
        fill={fill}
        d="M14.23,10.16L22.96.02h-2.07l-7.58,8.81L7.26.02H.27l9.16,13.32L.27,23.98h2.07l8.01-9.31,6.39,9.31h6.98l-9.49-13.82h0ZM11.4,13.46l-.93-1.33L3.09,1.57h3.18l5.96,8.52.93,1.33,7.74,11.08h-3.18l-6.32-9.04h0Z"
      />
    </Svg>
  );
});
X.displayName = 'X';

export { X };
