/**
 * The two platforms `PushNotificationService` ever registers a device from.
 * Sourced from `Capacitor.getPlatform()`, which also reports `'web'`; the
 * web build never reaches `DevicesApiService.register` in the first place
 * (there is no real push token to register there), so `'web'` is not a
 * member of this type.
 */
export type DevicePlatform = 'ios' | 'android';

/** Body for `POST /devices`, matching the API Contract exactly. */
export interface RegisterDevicePayload {
  pushToken: string;
  platform: DevicePlatform;
}

/**
 * Neither `POST /devices` nor `DELETE /devices/:pushToken` returns a body
 * (both are `204 No Content` per the API Contract), so there is nothing
 * here for a `zod` schema to validate; `DevicesApiService` passes no schema
 * argument into `BaseApiService.post`/`delete` for either call.
 */
