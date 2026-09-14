import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { environment } from '../../../environments/environment';
import { provideTestTranslations } from '../../testing/translate-testing';
import { AuthApiService } from './auth-api.service';

const sampleUserDto = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: '',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('AuthApiService', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTestTranslations()],
    });

    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('register posts to /auth/register and maps the response to an AuthSession', () => {
    let result: unknown;
    service.register('ada@example.com', 'password123', 'Ada Lovelace').subscribe((session) => (result = session));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.register}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ada@example.com', password: 'password123', displayName: 'Ada Lovelace' });
    req.flush({ accessToken: 'access-1', refreshToken: 'refresh-1', user: sampleUserDto });

    expect(result).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: sampleUserDto,
    });
  });

  it('login posts to /auth/login and maps the response to an AuthSession', () => {
    let result: unknown;
    service.login('ada@example.com', 'password123').subscribe((session) => (result = session));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.login}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ada@example.com', password: 'password123' });
    req.flush({ accessToken: 'access-1', refreshToken: 'refresh-1', user: sampleUserDto });

    expect(result).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: sampleUserDto,
    });
  });

  it('refresh posts the refresh token to /auth/refresh and maps the response', () => {
    let result: unknown;
    service.refresh('refresh-1').subscribe((refreshed) => (result = refreshed));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.refresh}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush({ accessToken: 'new-access' });

    expect(result).toEqual({ accessToken: 'new-access' });
  });

  it('logout posts the refresh token to /auth/logout and resolves with no body', () => {
    let result: unknown;
    service.logout('refresh-1').subscribe((body) => (result = body));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.logout}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(result).toBeNull();
  });
});
