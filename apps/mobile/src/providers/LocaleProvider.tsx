/* -------------------------------- POLYFILL -------------------------------- */
import '@formatjs/intl-getcanonicallocales/polyfill';
import '@formatjs/intl-locale/polyfill';
import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-datetimeformat/polyfill';
import '@formatjs/intl-displaynames/polyfill';
import '@formatjs/intl-listformat/polyfill';
import '@formatjs/intl-durationformat/polyfill';
import '@formatjs/intl-relativetimeformat/polyfill';
/* -------------------------------------------------------------------------- */

import { IntlProvider } from 'use-intl';
import { createContext, use, useCallback, useEffect, useState } from 'react';
import { getLocale, initI18n, setLocale as setLocaleHook } from '../lib/i18n';
import { useSplashScreen } from './SplashScreenProvider';
import { getCalendars } from 'expo-localization';
import { defaultSupportedLocale, SupportedLocale, supportedLocales } from '@libs/i18n';
import { logger } from '../logger';

type LocaleContextType = {
  locale: SupportedLocale;
  setLocale: (locale: string) => void;
};

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const useLocaleContext = () => {
  const ctx = use(LocaleContext);
  if (!ctx) throw new Error('useLocaleContext must be used in LocaleProvider');
  return ctx;
};

export const LocaleProvider = ({ children }: { children: React.ReactNode }) => {
  const { i18n } = useSplashScreen();
  const [locale, setLocaleState] = useState<SupportedLocale | undefined>(undefined);
  const [messages, setMessages] = useState<Record<string, string> | null>(null);
  const timeZone = getCalendars()[0]?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const setLocale = useCallback(
    async (newLocale: string) => {
      if (newLocale === locale) return;
      if (!supportedLocales.includes(newLocale as SupportedLocale)) {
        throw new Error(`Unsupported locale: ${newLocale}`);
      }
      setLocaleHook(newLocale);
      const { messages } = await initI18n(newLocale as SupportedLocale);
      setLocaleState(newLocale as SupportedLocale);
      setMessages(messages);
    },
    [locale],
  );

  useEffect(() => {
    (async () => {
      let initial: string = defaultSupportedLocale;
      try {
        initial = await getLocale();
      } catch (error) {
        logger.error('Failed to read saved locale, falling back to default', { error });
      }
      initial = supportedLocales.includes(initial as SupportedLocale)
        ? initial
        : defaultSupportedLocale;

      try {
        const { messages } = await initI18n(initial as SupportedLocale);
        setLocaleState(initial as SupportedLocale);
        setMessages(messages);
      } catch (error) {
        logger.error('Failed to initialize locale, retrying with default', {
          error,
          locale: initial,
        });
        try {
          const { messages } = await initI18n(defaultSupportedLocale);
          setLocaleState(defaultSupportedLocale);
          setMessages(messages);
        } catch (fallbackError) {
          logger.error('Failed to initialize default locale', { error: fallbackError });
          setLocaleState(defaultSupportedLocale);
          setMessages({});
        }
      } finally {
        i18n.setReady(true);
      }
    })();
  }, [i18n]);

  if (!messages || !locale) return null;

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
        {children}
      </IntlProvider>
    </LocaleContext.Provider>
  );
};
