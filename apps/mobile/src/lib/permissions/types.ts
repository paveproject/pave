export type PermissionId = 'bluetooth' | 'location' | 'camera' | 'notifications';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface PermissionHandle {
  status: PermissionStatus;
  request: () => Promise<boolean>;
}
