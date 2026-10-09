import { LucideProps } from 'lucide-react-native';
import { forwardRef } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

const ShapeVerticalRoundedForeground = forwardRef<Svg, LucideProps>((props, ref) => {
  const { color, fill = 'none', size = 24, ...otherProps } = props;
  return (
    <Svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill={fill} {...otherProps}>
      <Path
        fill={color}
        d="M15.75,2c.55,0,1,.45,1,1v18c0,.55-.45,1-1,1h-7.5c-.55,0-1-.45-1-1V3c0-.55.45-1,1-1h7.5M15.75,0h-7.5c-1.66,0-3,1.34-3,3v18c0,1.66,1.34,3,3,3h7.5c1.66,0,3-1.34,3-3V3c0-1.66-1.34-3-3-3h0Z"
      />
      <Rect fill={color} x="8.25" y="6" width="7.5" height="12" rx="2" ry="2" />
    </Svg>
  );
});
ShapeVerticalRoundedForeground.displayName = 'ShapeVerticalRoundedForeground';

export { ShapeVerticalRoundedForeground };
