import { Redirect, RelativePathString, useLocalSearchParams } from 'expo-router';
import NotFoundScreen from './+not-found';
import { supportedLocales } from '@libs/i18n';

// Matches either the current full tag (`fr-FR`) or the bare language
// prefix an older-style link might still use (`fr`) - deep links minted
// before the region-qualified locale migration must keep stripping.
const isLocaleSegment = (segment: string): boolean =>
  supportedLocales.some((locale) => locale === segment || locale.split('-')[0] === segment);

const handleLocalePrefix = (segments: string[]): string[] => {
  let firstNonLocaleIndex = 0;
  while (firstNonLocaleIndex < segments.length && isLocaleSegment(segments[firstNonLocaleIndex])) {
    firstNonLocaleIndex++;
  }

  if (firstNonLocaleIndex > 0) {
    return segments.slice(firstNonLocaleIndex);
  }
  return segments;
};

const handleUsernameRewrite = (segments: string[]): string[] => {
  if (segments.length > 0 && segments[0].startsWith('@')) {
    const username = segments[0].substring(1);
    const remainingSegments = segments.slice(1);
    return ['user', username, ...remainingSegments];
  }
  return segments;
};

const RestScreen = () => {
  const { rest, ...params } = useLocalSearchParams<{ rest: string[] }>();
  const initialSegments = rest || [];

  const processedSegments = handleUsernameRewrite(handleLocalePrefix(initialSegments));

  const hasChanged = initialSegments.join('/') !== processedSegments.join('/');

  if (hasChanged) {
    const newPath = processedSegments.length > 0 ? '/' + processedSegments.join('/') : '/';
    return <Redirect href={{ pathname: newPath as RelativePathString, params }} />;
  }

  return <NotFoundScreen />;
};

export default RestScreen;
