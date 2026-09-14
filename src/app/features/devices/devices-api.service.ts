import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { BaseApiService } from '../../core/http/base-api.service';
import { RegisterDevicePayload } from './device.dto';

/**
 * Talks to `/devices` and `/devices/:pushToken` over `BaseApiService`. One
 * method per endpoint, no direct `HttpClient` use, no hand-written error
 * handling. `DevicesService` (the facade) is the only thing that injects
 * this service.
 */
@Injectable({ providedIn: 'root' })
export class DevicesApiService {
  private readonly api = inject(BaseApiService);

  /** `POST /devices`, registering this device's push token with the backend. */
  register(payload: RegisterDevicePayload): Observable<void> {
    return this.api.post<void>(apiEndpoints.devices.register, payload);
  }

  /** `DELETE /devices/:pushToken`, called once on sign-out. */
  deregister(pushToken: string): Observable<void> {
    return this.api.delete<void>(apiEndpoints.devices.byPushToken(pushToken));
  }
}
