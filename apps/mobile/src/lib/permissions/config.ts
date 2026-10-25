import type { IconKey } from '../../constants/icons';
import type { PermissionId } from './types';

export interface PermissionConfigEntry {
  id: PermissionId;
  icon: IconKey;
  /** `pages.settings.permissions.<id>_label` - short permission name
   * only (e.g. "Bluetooth"), no feature suffix: the onboarding row
   * already carries the feature-specific "why" via `reasonKey`, and
   * repeating it in the label too is redundant. */
  labelKey: string;
  /** `pages.onboarding.permissions.<id>_reason` - quick, concrete "why
   * we need this" shown under the row in onboarding (not used on the
   * settings hub, which has no room for it). */
  reasonKey: string;
  /** `pages.onboarding.permissions.<id>_consequence` - what's lost by
   * leaving this permission off, shown as a line in onboarding's
   * "Continue anyway?" alert. */
  consequenceKey: string;
}

/** Single source of truth for every permission the app asks about,
 * shared by the onboarding screen and `settings/permissions.tsx`. */
export const PERMISSIONS: PermissionConfigEntry[] = [
  {
    id: 'location',
    icon: 'locate',
    labelKey: 'pages.settings.permissions.location_label',
    reasonKey: 'pages.onboarding.permissions.location_reason',
    consequenceKey: 'pages.onboarding.permissions.location_consequence',
  },
  {
    id: 'bluetooth',
    icon: 'bluetooth',
    labelKey: 'pages.settings.permissions.bluetooth_label',
    reasonKey: 'pages.onboarding.permissions.bluetooth_reason',
    consequenceKey: 'pages.onboarding.permissions.bluetooth_consequence',
  },
  {
    id: 'notifications',
    icon: 'bell',
    labelKey: 'pages.settings.permissions.notifications_label',
    reasonKey: 'pages.onboarding.permissions.notifications_reason',
    consequenceKey: 'pages.onboarding.permissions.notifications_consequence',
  },
  {
    id: 'camera',
    icon: 'camera',
    labelKey: 'pages.settings.permissions.camera_label',
    reasonKey: 'pages.onboarding.permissions.camera_reason',
    consequenceKey: 'pages.onboarding.permissions.camera_consequence',
  },
];
