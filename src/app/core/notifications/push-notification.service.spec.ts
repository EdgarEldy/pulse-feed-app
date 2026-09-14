import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../features/auth/auth.service';
import { DevicesService } from '../../features/devices/devices.service';
import { provideTestTranslations } from '../../testing/translate-testing';
import { User } from '../../features/users/user.model';
import { PushNotificationService } from './push-notification.service';

/**
 * `PushNotificationService`'s constructor eagerly calls `attachListeners()`
 * (async) and registers an `effect()`; both immediately no-op under Karma
 * because `Capacitor.isNativePlatform()` is false there (`setUpListeners`
 * never calls `PushNotifications.addListener`, and `registerForPush`/
 * `deregisterFromPush` never reach a real plugin call), which is exactly
 * why constructing the service at all is safe here without mocking either
 * `@capacitor/push-notifications` or `@capacitor/local-notifications` (the
 * former ships no web implementation at all to spy on in the first place).
 *
 * That same guard means the actual delivery path (a real native
 * `'registration'` event) is unreachable from this environment, so this
 * spec exercises `handleTokenReceived` directly, via bracket-notation
 * access to the private method: the exact seam a real code review finding
 * traced a race to (sign-out landing in the gap between
 * `PushNotifications.register()` being called and its `'registration'`
 * event actually firing, days later on a real device, asynchronously).
 * That method itself never touches the plugin, only `AuthService`/
 * `DevicesService`, both already fakeable via DI, so the regression is
 * fully testable without the plugin boundary getting in the way at all.
 */
describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let fakeDevices: jasmine.SpyObj<DevicesService>;
  let currentUserSignal: ReturnType<typeof signal<User | null>>;

  const sampleUser: User = {
    id: 'user-1',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    photoUrl: '',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    currentUserSignal = signal<User | null>(null);
    fakeDevices = jasmine.createSpyObj<DevicesService>('DevicesService', ['registerDevice', 'deregisterDevice']);
    fakeDevices.registerDevice.and.returnValue({ subscribe: () => undefined } as never);
    fakeDevices.deregisterDevice.and.returnValue({ subscribe: () => undefined } as never);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslations(),
        {
          provide: AuthService,
          useValue: { currentUser: currentUserSignal.asReadonly() as Signal<User | null> },
        },
        { provide: DevicesService, useValue: fakeDevices },
      ],
    });

    service = TestBed.inject(PushNotificationService);
  });

  describe('handleTokenReceived (the "registration" listener callback)', () => {
    it('registers the device when a user is currently signed in', () => {
      currentUserSignal.set(sampleUser);

      (service as unknown as { handleTokenReceived: (token: { value: string }) => void }).handleTokenReceived({
        value: 'push-token-1',
      });

      expect(fakeDevices.registerDevice).toHaveBeenCalledWith('push-token-1', jasmine.any(String));
    });

    it('does not register a token that arrives after the user has signed out', () => {
      // No currentUser set: simulates the token arriving in the gap after
      // sign-out already ran, the exact race this method exists to close.
      (service as unknown as { handleTokenReceived: (token: { value: string }) => void }).handleTokenReceived({
        value: 'push-token-1',
      });

      expect(fakeDevices.registerDevice).not.toHaveBeenCalled();
    });
  });

  describe('navigateToPost (shared by both notification-tap delivery paths)', () => {
    let router: Router;

    beforeEach(() => {
      router = TestBed.inject(Router);
      spyOn(router, 'navigate').and.resolveTo(true);
    });

    it('navigates to the post named by a { postId } payload', () => {
      (service as unknown as { navigateToPost: (data: unknown) => void }).navigateToPost({ postId: 'post-42' });

      expect(router.navigate).toHaveBeenCalledWith(['/posts', 'post-42']);
    });

    it('does not navigate when the payload has no postId', () => {
      (service as unknown as { navigateToPost: (data: unknown) => void }).navigateToPost({ announcement: true });

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not navigate when the payload is not an object', () => {
      (service as unknown as { navigateToPost: (data: unknown) => void }).navigateToPost(null);

      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
