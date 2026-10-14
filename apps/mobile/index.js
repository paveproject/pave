// Must be the very first import - polyfills `global.crypto.getRandomValues`,
// which `shamir-secret-sharing`/`@noble/*` (see `src/lib/recoveryKey`) need
// and Hermes doesn't provide on its own. Anything that runs before this
// and happens to touch those libraries would otherwise crash.
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// https://docs.expo.dev/router/reference/troubleshooting/#expo_router_app_root-not-defined

// Must be exported or Fast Refresh won't update the context
export function App() {
  const ctx = require.context('./src/app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);
