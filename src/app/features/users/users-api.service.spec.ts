import { HttpEventType, HttpProgressEvent, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { environment } from '../../../environments/environment';
import { provideTestTranslations } from '../../testing/translate-testing';
import { UsersApiService } from './users-api.service';

const sampleUserDto = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: 'https://example.com/ada.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('UsersApiService', () => {
  let service: UsersApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()],
    });

    service = TestBed.inject(UsersApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getUser fetches GET /users/:id and maps the response to a User', () => {
    let result: unknown;
    service.getUser('user-1').subscribe((user) => (result = user));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.users.byId('user-1')}`);
    expect(req.request.method).toBe('GET');
    req.flush(sampleUserDto);

    expect(result).toEqual(sampleUserDto);
  });

  it('getUser surfaces a validation AppError when the response fails schema validation', () => {
    let error: unknown;
    service.getUser('user-1').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.users.byId('user-1')}`);
    req.flush({ id: 'user-1' });

    expect((error as { kind: string }).kind).toBe('validation');
  });

  it('updateProfile patches /users/me with the display name and maps the response to a User', () => {
    let result: unknown;
    service.updateProfile('Ada L.').subscribe((user) => (result = user));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.users.me}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ displayName: 'Ada L.' });
    req.flush({ ...sampleUserDto, displayName: 'Ada L.' });

    expect(result).toEqual({ ...sampleUserDto, displayName: 'Ada L.' });
  });

  it('updateProfile maps a mocked 401 response to an unauthorized AppError', () => {
    let error: unknown;
    service.updateProfile('Ada L.').subscribe({ error: (err: unknown) => (error = err) });

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.users.me}`);
    req.flush({ message: 'Session expired.' }, { status: 401, statusText: 'Unauthorized' });

    expect(error).toEqual({ kind: 'unauthorized', message: 'Session expired.' });
  });

  it('uploadAvatar posts multipart form data to /users/me/avatar and emits progress then the result', () => {
    const events: unknown[] = [];
    const file = new File(['avatar-bytes'], 'avatar.jpg', { type: 'image/jpeg' });
    service.uploadAvatar(file).subscribe((event) => events.push(event));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.users.meAvatar}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).get('file')).toBe(file);

    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 } as HttpProgressEvent);
    req.flush({ photoUrl: 'https://example.com/new-avatar.jpg' });

    expect(events).toEqual([{ progress: 50 }, { progress: 100, result: { photoUrl: 'https://example.com/new-avatar.jpg' } }]);
  });
});
