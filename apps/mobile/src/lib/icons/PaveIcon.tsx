import Svg, { Circle, Path } from 'react-native-svg';
import { LucideProps } from 'lucide-react-native';
import { forwardRef } from 'react';

const PaveIcon = forwardRef<Svg, LucideProps>((props, ref) => {
  const { color = 'currentColor', width: widthProps, height: heightProps, ...otherProps } = props;
  const ratio = 541.5 / 541.5;
  const height = widthProps !== undefined ? Number(widthProps) / ratio : heightProps;
  const width =
    widthProps !== undefined ? widthProps : height !== undefined ? Number(height) * ratio : 200;
  return (
    <Svg
      ref={ref}
      id="pave-icon"
      width={width}
      height={height}
      viewBox="0 0 541.5 541.5"
      fill="none"
      {...otherProps}
    >
      <Circle cx="433.8" cy="433.2" r="108.3" fill={color} />
      <Path
        d="M435.5,0c-32.4-0.5-61.5,13.3-81.7,35.4c-20.1,22.1-48.1,35.5-78,35.5h-8.9c-29.9,0-57.9-13.4-78-35.5
			C166,10.2,131.3-4.2,93.5,1.1C46.3,7.6,8.2,45.7,1.7,92.9c-5.2,37.8,9.1,72.5,34.4,95.4c22.1,20.1,35.5,48.1,35.5,78v8.9
			c0,29.9-13.4,57.9-35.5,78c-22.1,20.1-35.9,49.3-35.4,81.6c0.8,56.5,46.6,103.9,103,106.5c62.2,2.9,113.6-46.6,113.6-108.2
			c0-32.7-14.5-61.9-37.4-81.7c-22-19-33.6-47.4-33.6-76.5v-6.3c0-30.1,11.8-59.4,34.3-79.4c3.3-2.9,6.5-6.1,9.4-9.4
			c19.9-22.5,49.3-34.3,79.4-34.3h6.3c29.1,0,57.4,11.6,76.5,33.6c19.8,22.9,49.1,37.4,81.7,37.4c61.5,0,111.1-51.3,108.2-113.5
			C539.4,46.7,492,0.9,435.5,0L435.5,0z"
        fill={color}
      />
    </Svg>
  );
});
PaveIcon.displayName = 'PaveIcon';

export { PaveIcon };
