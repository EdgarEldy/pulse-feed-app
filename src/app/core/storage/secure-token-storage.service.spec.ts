import { TestBed } from '@angular/core/testing';
import { SecureTokenStorageService } from './secure-token-storage.service';
import { User } from '../../features/users/user.model';

/**
 * `Capacitor.getPlatform()` reports `'web'` in the Karma/ChromeHeadless
 * environment these tests run in, so `SecureTokenStorageService` always
 * picks its `IndexedDB`-backed store here. That is the only branch these
 * tests can exercise reliably: the native branch talks to
 * `capacitor-secure-storage-plugin`'s own plugin proxy, whose target
 * platform is captured once at module load time (before any per-test spy on
 * `Capacitor.getPlatform` could run), so it cannot be redirected from a test
 * without reaching past the plugin's own registration internals.
 */
describe('SecureTokenStorageService (web/IndexedDB branch)', () => {
  let service: SecureTokenStorageService;

  const sampleUser: User = {
    id: 'user-1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoUrl: '',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SecureTokenStorageService);
    await service.clear();
  });

  afterEach(async () => {
    await service.clear();
  });

  it('returns null for tokens and the user before anything has been stored', async () => {
    expect(await service.getAccessToken()).toBeNull();
    expect(await service.getRefreshToken()).toBeNull();
    expect(await service.getUser()).toBeNull();
  });

  it('round-trips access and refresh tokens through setTokens', async () => {
    await service.setTokens('access-1', 'refresh-1');

    expect(await service.getAccessToken()).toBe('access-1');
    expect(await service.getRefreshToken()).toBe('refresh-1');
  });

  it('round-trips the cached user through setUser/getUser', async () => {
    await service.setUser(sampleUser);

    expect(await service.getUser()).toEqual(sampleUser);
  });

  it('clears tokens and the cached user', async () => {
    await service.setTokens('access-1', 'refresh-1');
    await service.setUser(sampleUser);

    await service.clear();

    expect(await service.getAccessToken()).toBeNull();
    expect(await service.getRefreshToken()).toBeNull();
    expect(await service.getUser()).toBeNull();
  });
});
