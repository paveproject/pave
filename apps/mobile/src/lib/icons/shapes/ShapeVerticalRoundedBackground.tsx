import { LucideProps } from 'lucide-react-native';
import { forwardRef } from 'react';
import Svg, { Path } from 'react-native-svg';

const ShapeVerticalRoundedBackground = forwardRef<Svg, LucideProps>((props, ref) => {
  const { color, fill = 'none', size = 24, ...otherProps } = props;
  return (
    <Svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill={fill} {...otherProps}>
      <Path
        fill={color}
        d="M15.75,0h-7.5c-1.66,0-3,1.34-3,3v18c0,1.66,1.34,3,3,3h7.5c1.66,0,3-1.34,3-3V3c0-1.66-1.34-3-3-3ZM15.75,16c0,1.1-.9,2-2,2h-3.5c-1.1,0-2-.9-2-2v-8c0-1.1.9-2,2-2h3.5c1.1,0,2,.9,2,2v8Z"
      />
    </Svg>
  );
});
ShapeVerticalRoundedBackground.displayName = 'ShapeVerticalRoundedBackground';

export { ShapeVerticalRoundedBackground };
