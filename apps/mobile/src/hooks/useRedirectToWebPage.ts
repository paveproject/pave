import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { openWebPage } from '../lib/webPage';

/**
 * For routes that only exist so an in-app or external link (deep link, universal link)
 * has somewhere to land, but whose actual content lives on the web app. Opens the
 * equivalent web page in an in-app browser tab, then leaves the (otherwise blank) screen.
 */
export const useRedirectToWebPage = (path: string) => {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    (async () => {
      try {
        await openWebPage(path);
      } finally {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/');
        }
      }
    })();
  }, [path, router]);
};
