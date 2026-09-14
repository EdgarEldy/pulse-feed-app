import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/auth.service';
import { SecureTokenStorageService } from '../storage/secure-token-storage.service';
import { apiEndpoints } from './api-endpoints';
import { authInterceptor } from './auth.interceptor';

const postsUrl = `${environment.apiBaseUrl}/posts`;
const loginUrl = `${environment.apiBaseUrl}${apiEndpoints.auth.login}`;
const logoutUrl = `${environment.apiBaseUrl}${apiEndpoints.auth.logout}`;

class FakeSecureTokenStorageService {
  accessToken: string | null = null;

  async getAccessToken(): Promise<string | null> {
    return this.accessToken;
  }
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let fakeTokenStorage: FakeSecureTokenStorageService;
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    fakeTokenStorage = new FakeSecureTokenStorageService();
    authServiceSpy = jasmine.createSpyObj<AuthService>('AuthService', ['refreshSession', 'signOut']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: SecureTokenStorageService, useValue: fakeTokenStorage },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches the stored access token to an outgoing request', async () => {
    fakeTokenStorage.accessToken = 'token-abc';

    http.get(postsUrl).subscribe();
    // The interceptor reads the token via `from(tokenStorage.getAccessToken())`,
    // a real Promise even in this fake, so the request is not actually
    // dispatched to the mock backend until the next microtask.
    await Promise.resolve();

    const req = httpMock.expectOne(postsUrl);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
    req.flush({});
  });

  it('sends no Authorization header when no access token is stored', async () => {
    http.get(postsUrl).subscribe();
    await Promise.resolve();

    const req = httpMock.expectOne(postsUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('skips the Authorization header for register/login/refresh requests', () => {
    fakeTokenStorage.accessToken = 'token-abc';

    http.post(loginUrl, { email: 'a@b.com', password: 'secret123' }).subscribe();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('does not touch a request outside the API base URL', () => {
    fakeTokenStorage.accessToken = 'token-abc';

    // AppTranslateLoader fetches bundled i18n assets over the same
    // HttpClient; this must never get a bearer token attached or be pulled
    // into the refresh/retry flow, since it has nothing to do with the
    // backend API.
    http.get('assets/i18n/en.json').subscribe();

    const req = httpMock.expectOne('assets/i18n/en.json');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});

    expect(authServiceSpy.refreshSession).not.toHaveBeenCalled();
  });

  it('retries the original request once after a successful refresh on a 401', async () => {
    fakeTokenStorage.accessToken = 'old-token';
    authServiceSpy.refreshSession.and.returnValue(of('new-token'));

    let result: unknown;
    http.get(postsUrl).subscribe((body) => (result = body));
    await Promise.resolve();

    const firstReq = httpMock.expectOne(postsUrl);
    expect(firstReq.request.headers.get('Authorization')).toBe('Bearer old-token');
    firstReq.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshSession).toHaveBeenCalledTimes(1);

    const retriedReq = httpMock.expectOne(postsUrl);
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer new-token');
    retriedReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('signs the user out and propagates the original error when the refresh itself fails', async () => {
    authServiceSpy.refreshSession.and.returnValue(
      throwError(() => ({ kind: 'unauthorized', message: 'No refresh token available.' })),
    );

    let error: unknown;
    http.get(postsUrl).subscribe({ error: (err: unknown) => (error = err) });
    await Promise.resolve();

    const req = httpMock.expectOne(postsUrl);
    req.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.signOut).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(401);
  });

  it('does not trigger the refresh flow for a 401 on /auth/logout', async () => {
    fakeTokenStorage.accessToken = 'token-abc';

    let error: unknown;
    http.post(logoutUrl, { refreshToken: 'refresh-1' }).subscribe({ error: (err: unknown) => (error = err) });
    await Promise.resolve();

    const req = httpMock.expectOne(logoutUrl);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
    req.flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshSession).not.toHaveBeenCalled();
    expect(authServiceSpy.signOut).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(HttpErrorResponse);
  });
});
