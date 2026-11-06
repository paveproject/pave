/** `backgroundLocation` is separate from `location` on purpose: iOS and
 * Android both treat "while using the app" and "always" as two distinct
 * grants, and only protest mode needs the second. Asking for it up front
 * would be a much worse prompt for everyone else. */
export type PermissionId =
  | 'bluetooth'
  | 'location'
  | 'backgroundLocation'
  | 'camera'
  | 'notifications';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionHandle {
  status: PermissionStatus;
  request: () => Promise<boolean>;
}
