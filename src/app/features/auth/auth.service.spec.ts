import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiEndpoints } from '../../core/http/api-endpoints';
import { SecureTokenStorageService } from '../../core/storage/secure-token-storage.service';
import { environment } from '../../../environments/environment';
import { User } from '../users/user.model';
import { AuthService } from './auth.service';

/**
 * Drains every currently-pending microtask (Promise chain), not just one.
 * `AuthService` chains several Promise-returning storage calls (via
 * `Promise.all`, itself inside an `async` method invoked from a `switchMap`)
 * after an HTTP response, several microtask hops deep. Awaiting a
 * `setTimeout` macrotask, rather than guessing how many `Promise.resolve()`
 * hops are needed, guarantees the whole microtask queue empties first.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Stands in for `SecureTokenStorageService` with a plain in-memory store,
 * so these tests exercise `AuthService`'s own orchestration (state
 * transitions, session persistence, refresh sharing) without depending on
 * `Capacitor`/`IndexedDB`.
 */
class FakeSecureTokenStorageService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private user: User | null = null;

  async getAccessToken(): Promise<string | null> {
    return this.accessToken;
  }

  async getRefreshToken(): Promise<string | null> {
    return this.refreshToken;
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  async getUser(): Promise<User | null> {
    return this.user;
  }

  async setUser(user: User): Promise<void> {
    this.user = user;
  }

  async clear(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
  }
}

const sampleUser: User = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  email: 'ada@example.com',
  photoUrl: '',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let fakeTokenStorage: FakeSecureTokenStorageService;

  beforeEach(() => {
    fakeTokenStorage = new FakeSecureTokenStorageService();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SecureTokenStorageService, useValue: fakeTokenStorage },
      ],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('signIn', () => {
    it('sets currentUser and a success authState on a successful sign-in', async () => {
      service.signIn('ada@example.com', 'password123');

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.login}`);
      expect(req.request.method).toBe('POST');
      req.flush({ accessToken: 'access-1', refreshToken: 'refresh-1', user: sampleUser });

      await flushMicrotasks();

      expect(service.currentUser()).toEqual(sampleUser);
      expect(service.isAuthenticated()).toBeTrue();
      expect(service.authState()).toEqual({ status: 'success' });
      expect(await fakeTokenStorage.getAccessToken()).toBe('access-1');
      expect(await fakeTokenStorage.getRefreshToken()).toBe('refresh-1');
    });

    it('sets an unauthorized AppError on a mocked 401 response', () => {
      service.signIn('ada@example.com', 'wrong-password');

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.login}`);
      req.flush({ message: 'Invalid credentials.' }, { status: 401, statusText: 'Unauthorized' });

      expect(service.authState()).toEqual({
        status: 'error',
        error: { kind: 'unauthorized', message: 'Session expired.' },
      });
      expect(service.isAuthenticated()).toBeFalse();
      expect(service.currentUser()).toBeNull();
    });

    it('reports a loading state while the request is in flight', () => {
      service.signIn('ada@example.com', 'password123');

      expect(service.authState()).toEqual({ status: 'loading' });

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.login}`);
      req.flush({ accessToken: 'access-1', refreshToken: 'refresh-1', user: sampleUser });
    });
  });

  describe('register', () => {
    it('surfaces a server AppError when the email is already in use', () => {
      service.register('ada@example.com', 'password123', 'Ada');

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.register}`);
      req.flush({ message: 'Email already in use.' }, { status: 409, statusText: 'Conflict' });

      expect(service.authState()).toEqual({
        status: 'error',
        error: { kind: 'server', message: 'Email already in use.', statusCode: 409 },
      });
    });
  });

  describe('restoreSession', () => {
    it('leaves currentUser null when no access token is stored', async () => {
      await service.restoreSession();

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
    });

    it('restores currentUser from a stored access token and cached user', async () => {
      await fakeTokenStorage.setTokens('access-1', 'refresh-1');
      await fakeTokenStorage.setUser(sampleUser);

      await service.restoreSession();

      expect(service.currentUser()).toEqual(sampleUser);
      expect(service.isAuthenticated()).toBeTrue();
    });

    it('clears storage and leaves currentUser null when a token exists without a cached user', async () => {
      await fakeTokenStorage.setTokens('access-1', 'refresh-1');

      await service.restoreSession();

      expect(service.currentUser()).toBeNull();
      expect(await fakeTokenStorage.getAccessToken()).toBeNull();
    });
  });

  describe('updateCurrentUser', () => {
    it('updates currentUser and persists it via storage when a session is active', async () => {
      await fakeTokenStorage.setTokens('access-1', 'refresh-1');
      await fakeTokenStorage.setUser(sampleUser);
      await service.restoreSession();

      const updatedUser: User = { ...sampleUser, displayName: 'Ada L.' };
      await service.updateCurrentUser(updatedUser);

      expect(service.currentUser()).toEqual(updatedUser);
      expect(await fakeTokenStorage.getUser()).toEqual(updatedUser);
    });

    it('does nothing when nobody is currently signed in', async () => {
      await service.updateCurrentUser(sampleUser);

      expect(service.currentUser()).toBeNull();
      expect(await fakeTokenStorage.getUser()).toBeNull();
    });
  });

  describe('signOut', () => {
    it('clears the session locally after a successful logout call', async () => {
      await fakeTokenStorage.setTokens('access-1', 'refresh-1');
      await fakeTokenStorage.setUser(sampleUser);
      await service.restoreSession();
      expect(service.isAuthenticated()).toBeTrue();

      service.signOut();
      // signOut() reads the refresh token via a Promise before it can
      // issue the logout call at all.
      await flushMicrotasks();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.logout}`);
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      req.flush(null);

      await flushMicrotasks();

      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBeFalse();
      expect(await fakeTokenStorage.getAccessToken()).toBeNull();
    });

    it('still clears the session locally when the logout call fails', async () => {
      await fakeTokenStorage.setTokens('access-1', 'refresh-1');
      await fakeTokenStorage.setUser(sampleUser);
      await service.restoreSession();

      service.signOut();
      await flushMicrotasks();

      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.logout}`);
      req.error(new ProgressEvent('error'), { status: 0 });

      await flushMicrotasks();

      expect(service.currentUser()).toBeNull();
      expect(await fakeTokenStorage.getAccessToken()).toBeNull();
    });
  });

  describe('refreshSession', () => {
    it('shares a single in-flight /auth/refresh call across concurrent callers', async () => {
      await fakeTokenStorage.setTokens('expired-access', 'refresh-1');

      const results: string[] = [];
      service.refreshSession().subscribe((token) => results.push(token));
      service.refreshSession().subscribe((token) => results.push(token));
      service.refreshSession().subscribe((token) => results.push(token));
      // refreshSession() reads the refresh token via a Promise before
      // issuing the actual HTTP call.
      await flushMicrotasks();

      // httpMock.expectOne throws if more than one matching request went
      // out, which is exactly what would happen if refreshSession() were
      // not sharing its in-flight Observable across the three calls above.
      const req = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.refresh}`);
      expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
      req.flush({ accessToken: 'new-access' });

      await flushMicrotasks();

      expect(results).toEqual(['new-access', 'new-access', 'new-access']);
      expect(await fakeTokenStorage.getAccessToken()).toBe('new-access');
    });

    it('starts a genuinely new refresh call once the previous one has completed', async () => {
      await fakeTokenStorage.setTokens('expired-access', 'refresh-1');

      service.refreshSession().subscribe();
      await flushMicrotasks();
      const firstReq = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.refresh}`);
      firstReq.flush({ accessToken: 'first-refresh' });
      await flushMicrotasks();

      service.refreshSession().subscribe();
      await flushMicrotasks();
      const secondReq = httpMock.expectOne(`${environment.apiBaseUrl}${apiEndpoints.auth.refresh}`);
      secondReq.flush({ accessToken: 'second-refresh' });
      await flushMicrotasks();

      expect(await fakeTokenStorage.getAccessToken()).toBe('second-refresh');
    });

    it('errors with an unauthorized AppError when no refresh token is stored', async () => {
      let error: unknown;
      service.refreshSession().subscribe({ error: (err: unknown) => (error = err) });

      await flushMicrotasks();

      expect(error).toEqual({ kind: 'unauthorized', message: 'No refresh token available.' });
      httpMock.expectNone(`${environment.apiBaseUrl}${apiEndpoints.auth.refresh}`);
    });
  });
});
