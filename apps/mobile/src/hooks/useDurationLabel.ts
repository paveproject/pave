import { useTranslations } from 'use-intl';

/** Shared between both recovery-delay pickers (normal and protest mode). */
export const DURATION_OPTIONS_SECONDS = [300, 900, 3600, 21600, 86400, 259200, 604800] as const;

/**
 * Formats a duration in seconds (always one of `DURATION_OPTIONS_SECONDS`)
 * into its largest whole unit - "1 day" rather than "24 hours", "1 hour"
 * rather than "60 minutes".
 */
export const useDurationLabel = () => {
  const t = useTranslations();

  return (seconds: number): string => {
    if (seconds % 86400 === 0) return t('messages.days_count', { count: seconds / 86400 });
    if (seconds % 3600 === 0) return t('messages.hours_count', { count: seconds / 3600 });
    return t('messages.minutes_count', { count: Math.round(seconds / 60) });
  };
};
