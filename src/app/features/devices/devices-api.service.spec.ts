import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { provideTestTranslations } from '../../testing/translate-testing';
import { DevicesApiService } from './devices-api.service';

describe('DevicesApiService', () => {
  let service: DevicesApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()],
    });

    service = TestBed.inject(DevicesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('register posts to /devices with the push token and platform', () => {
    let completed = false;
    service.register({ pushToken: 'push-token-1', platform: 'android' }).subscribe(() => (completed = true));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.devices.register}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pushToken: 'push-token-1', platform: 'android' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('register maps a status-0 response to a network AppError', () => {
    let error: unknown;
    service.register({ pushToken: 'push-token-1', platform: 'ios' }).subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.devices.register}`);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(error).toEqual({ kind: 'network', message: "You're offline. Check your connection and try again." });
  });

  it('deregister sends DELETE to /devices/:pushToken', () => {
    let completed = false;
    service.deregister('push-token-1').subscribe(() => (completed = true));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.devices.byPushToken('push-token-1')}`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBeTrue();
  });

  it('deregister maps a status-0 response to a network AppError', () => {
    let error: unknown;
    service.deregister('push-token-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.devices.byPushToken('push-token-1')}`);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(error).toEqual({ kind: 'network', message: "You're offline. Check your connection and try again." });
  });
});
