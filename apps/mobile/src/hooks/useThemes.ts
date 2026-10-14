import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { ThemeVariant } from '../stores/useUIStore';

export const useThemes = () => {
  const t = useTranslations();
  const themes = useMemo<{ value: ThemeVariant; label: string }[]>(
    () => [
      {
        value: 'light',
        label: t('messages.light'),
      },
      {
        value: 'dark',
        label: t('messages.dark'),
      },
      {
        value: 'system',
        label: t('messages.system'),
      },
    ],
    [t],
  );

  return themes;
};
