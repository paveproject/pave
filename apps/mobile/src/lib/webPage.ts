import * as WebBrowser from 'expo-web-browser';
import app from '../constants/app';

/**
 * Opens a path of the web app in an in-app browser tab (Custom Tabs / SFSafariViewController).
 *
 * Plain `Linking.openURL` is not safe for our own domain: the app claims
 * `https://{webDomain}/*` as a universal/app link on both platforms, so an implicit
 * `ACTION_VIEW` back to it would be intercepted by the app itself instead of opening a browser.
 */
export const openWebPage = (path: string) => {
  return WebBrowser.openBrowserAsync(`https://${app.webDomain}${path}`);
};
