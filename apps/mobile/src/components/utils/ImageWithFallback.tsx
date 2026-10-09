import * as React from 'react';
import { ComponentProps, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ImageIcon } from 'lucide-react-native';
import { Image, ImageProps, ImageSource } from 'expo-image';
import Animated from 'react-native-reanimated';
import tw from '../../lib/tw';
import { useTheme } from '../../providers/ThemeProvider';

export type ImageType = 'default' | 'user' | null;

interface ImageWithFallbackProps extends ComponentProps<typeof Animated.View> {
  source: ImageSource;
  contentFit?: ImageProps['contentFit'];
  transition?: ImageProps['transition'];
  cachePolicy?: ImageProps['cachePolicy'];
  alt: string;
  type?: ImageType;
  children?: React.ReactNode;
}

// const blurhash =
//   '|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[';

export const ImageWithFallback = React.forwardRef<View, ImageWithFallbackProps>(
  (
    {
      source,
      alt,
      type = 'default',
      contentFit = 'cover',
      transition = 250,
      cachePolicy = 'disk',
      style,
      children,
      ...rest
    },
    ref,
  ) => {
    const { colors } = useTheme();
    const [imgSrc, setImgSrc] = useState<ImageSource | undefined | null>(
      source.uri && source.uri.length! > 0 ? source : null,
    );

    useEffect(() => {
      // Resets the fallback state whenever the source prop changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImgSrc(source.uri && source.uri.length! > 0 ? source : null);
    }, [source]);

    return (
      <Animated.View
        ref={ref}
        style={[
          { backgroundColor: colors.muted },
          tw.style('relative overflow-hidden items-center justify-center w-full h-full rounded-md'),
          style,
        ]}
        {...rest}
      >
        {imgSrc ? (
          <Image
            source={imgSrc}
            onError={() => {
              setImgSrc(null);
            }}
            style={tw`w-full h-full`}
            transition={transition}
            contentFit={contentFit}
            cachePolicy={cachePolicy}
          />
        ) : (
          <Fallback type={type} alt={alt} />
        )}
        {children}
      </Animated.View>
    );
  },
);
ImageWithFallback.displayName = 'ImageWithFallback';

const Fallback = ({ type, alt }: { type?: string | null; alt?: string }) => {
  const { colors } = useTheme();
  switch (type) {
    default:
      return <ImageIcon color={colors.foreground} style={tw.style('w-2/5 h-2/5')} />;
  }
};
