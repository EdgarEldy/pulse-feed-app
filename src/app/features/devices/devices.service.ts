import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DevicePlatform, RegisterDevicePayload } from './device.dto';
import { DevicesApiService } from './devices-api.service';

/**
 * Facade for `features/devices`. `PushNotificationService` is the only thing
 * that should depend on this service; it never injects `DevicesApiService`
 * directly, keeping the "only a facade talks to an `*ApiService`" rule intact
 * even though this feature has no `pages`/`components` of its own and no
 * cacheable data to hold in a Signal.
 *
 * Registering a device is not queued through `SyncService` the way posts,
 * comments, and likes are: a device token registration made while offline
 * would go stale almost immediately (push tokens rotate, and the whole
 * point of registering is so a *currently reachable* device can receive a
 * push), so `PushNotificationService` simply lets a failed registration
 * attempt be retried the next time it runs (next sign-in, next app launch)
 * rather than durably queuing a stale intent.
 */
@Injectable({ providedIn: 'root' })
export class DevicesService {
  private readonly api = inject(DevicesApiService);

  registerDevice(pushToken: string, platform: DevicePlatform): Observable<void> {
    const payload: RegisterDevicePayload = { pushToken, platform };
    return this.api.register(payload);
  }

  deregisterDevice(pushToken: string): Observable<void> {
    return this.api.deregister(pushToken);
  }
}
