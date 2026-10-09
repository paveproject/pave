import { useMarkdownStyle } from '../../hooks/useMarkdownStyle';
import { DOMAIN_NAME } from '../../env/common';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { Href, useRouter } from 'expo-router';
import {
  EnrichedMarkdownText as EnrichedMarkdownTextBase,
  EnrichedMarkdownTextProps,
} from 'react-native-enriched-markdown';

const isInternalUrl = (url: string) => {
  try {
    const { hostname } = new URL(url);
    return hostname === DOMAIN_NAME || hostname === `www.${DOMAIN_NAME}`;
  } catch {
    return false;
  }
};

const EnrichedMarkdownText = ({
  markdownStyle,
  onLinkPress,
  ...props
}: EnrichedMarkdownTextProps) => {
  const markdownStyleDefault = useMarkdownStyle();
  const router = useRouter();

  const handleLinkPress = useCallback(
    ({ url }: { url: string }) => {
      if (isInternalUrl(url)) {
        const { pathname, search } = new URL(url);
        router.push(`${pathname}${search}` as Href);
        return;
      }
      Linking.openURL(url);
    },
    [router],
  );

  return (
    <EnrichedMarkdownTextBase
      markdownStyle={{
        ...markdownStyleDefault,
        ...markdownStyle,
      }}
      onLinkPress={onLinkPress ?? handleLinkPress}
      {...props}
    />
  );
};

export { EnrichedMarkdownText };
