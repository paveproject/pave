import type { DeviceType } from '@libs/api-js';

// Platform names, not translated across locales (same reasoning as
// "iOS"/"Android" showing up untranslated everywhere else in the app) -
// shared by every screen that lists a device (`validation/device/[id]`,
// `validation/own-device/[id]`, `settings/devices`'s own inline version,
// `OwnDevicePendingContent`).
export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
};
