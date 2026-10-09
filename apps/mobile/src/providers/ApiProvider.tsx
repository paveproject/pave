import { useLocale } from 'use-intl';
import { client } from '@libs/api-js';
import { useMemo } from 'react';
import { HEADER_LANGUAGE_KEY } from '@libs/i18n';

export const ApiProvider = ({ children }: { children?: React.ReactNode }) => {
  const locale = useLocale();

  useMemo(() => {
    client.setConfig({
      headers: {
        [HEADER_LANGUAGE_KEY]: locale,
      },
    });
  }, [locale]);

  return children;
};
