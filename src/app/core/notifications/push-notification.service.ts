import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import {
  ActionPerformed as LocalNotificationActionPerformed,
  LocalNotifications,
} from '@capacitor/local-notifications';
import {
  ActionPerformed as PushNotificationActionPerformed,
  PushNotificationSchema,
  PushNotifications,
  Token as PushToken,
} from '@capacitor/push-notifications';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../features/auth/auth.service';
import { DevicePlatform } from '../../features/devices/device.dto';
import { DevicesService } from '../../features/devices/devices.service';

/**
 * Orchestrates push notifications end to end: permission + token
 * registration (backed by `DevicesService`, itself backed by
 * `DevicesApiService` -> `BaseApiService`, never `HttpClient` directly from
 * here), foreground display via `@capacitor/local-notifications`, and
 * deep-linking a tap on either kind of notification into `PostDetailPage`.
 *
 * This is the one service in the app that talks to the push/local-notification
 * plugins directly, the same way `ConnectivityService` is the one place that
 * talks to `@capacitor/network` directly: neither plugin caches a SQLite table
 * or wraps `HttpClient`, so neither the `*LocalService` nor the `*ApiService`
 * convention applies to them, but the same "wrap the plugin once, expose a
 * plain surface to the rest of the app" idea still does. Nothing else in the
 * app imports either plugin.
 *
 * Registering and deregistering are driven entirely by `AuthService.currentUser`
 * rather than by anything a component calls directly: registering a push
 * token only makes sense once someone is actually signed in (`POST /devices`
 * is an authenticated endpoint), and the natural, unmissable moment to give up
 * that token again is the same moment the session itself goes away. An
 * `effect()` reacting to `currentUser` covers both the "just signed in/
 * restored a session" transition and the "just signed out" transition with
 * one piece of code, and also covers a session already present at the very
 * first run of the effect (unlike `SyncService`'s connectivity effect, this
 * one deliberately does *not* skip its first run: `AuthService.restoreSession()`
 * may have already populated `currentUser` by the time this service is
 * constructed, in which case that first run is exactly the "already signed
 * in at startup" case, not a false transition to be ignored).
 *
 * Constructed eagerly from `app.config.ts`'s `provideAppInitializer`, right
 * after `AuthService.restoreSession()` resolves, so its listeners are live
 * and its effect has already observed the restored session (or lack of one)
 * before the app renders its first route. Nothing else in the app injects
 * this service; it has no public API, everything it does is a reaction to
 * `AuthService.currentUser` or to the two plugins' own events.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly auth = inject(AuthService);
  private readonly devices = inject(DevicesService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The push token this device last registered, so sign-out can deregister
   * the same token it registered at sign-in. Kept in memory only: this is a
   * root singleton for the lifetime of the app process, and a fresh
   * `PushNotifications.register()` call (issued again on the very next
   * sign-in) reliably repopulates it, so nothing is lost by not persisting
   * it across a full app restart.
   */
  private readonly registeredToken = signal<string | null>(null);

  /**
   * `LocalNotifications.schedule` requires a 32-bit integer `id` per
   * notification. A plain incrementing counter is enough here: nothing in
   * this app ever needs to look a specific foreground-notification id back
   * up later, unlike `getDeliveredNotifications`/`removeDeliveredNotifications`
   * use cases this app does not need.
   */
  private nextLocalNotificationId = 1;

  constructor() {
    this.attachListeners();

    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        void this.registerForPush();
      } else {
        this.deregisterFromPush();
      }
    });
  }

  /**
   * Requests notification permission and, once granted, asks the OS to
   * register this device for push. The actual token only arrives later,
   * asynchronously, through the `'registration'` listener set up in
   * `attachListeners()` — `PushNotifications.register()` itself resolves
   * with no return value, per the plugin's own contract.
   *
   * A no-op on the web build (`Capacitor.isNativePlatform()`): there is no
   * real push token to register there, and `PushNotifications`' web
   * implementation has no meaningful `register()` behavior to trigger.
   */
  private async registerForPush(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      // Same treatment as `AvatarPickerComponent`'s denied camera prompt:
      // a denied notification permission is a normal, expected outcome, not
      // an app error worth surfacing through `AppError`.
      return;
    }

    await PushNotifications.register();
  }

  /**
   * Calls `DELETE /devices/:pushToken` for whatever token this device last
   * registered, then forgets it. A no-op if nothing was ever registered in
   * this process: either sign-out beat `'registration'` to firing at all
   * (in which case `handleTokenReceived` below skips registering it in the
   * first place, so there is genuinely nothing to undo here), or the user
   * was already signed out once before.
   *
   * Fire-and-forget like `AuthService.signOut()` itself: there is nothing
   * useful this method's caller (the `effect()` above) could do with a
   * failure here beyond what already happens naturally — the stale
   * registration simply stops receiving pushes for an account nobody is
   * signed into on this device anymore, and the next sign-in re-registers a
   * (typically identical) token regardless.
   */
  private deregisterFromPush(): void {
    const token = this.registeredToken();
    if (!token) {
      return;
    }
    this.devices.deregisterDevice(token).subscribe({ error: () => undefined });
    this.registeredToken.set(null);
  }

  /**
   * The `'registration'` listener's callback, extracted so a spec can call
   * it directly without going through the plugin at all (its actual
   * delivery path is unreachable from Karma either way, guarded behind
   * `Capacitor.isNativePlatform()` further up in `setUpListeners`).
   *
   * `requestPermissions()`/`register()` above and this callback firing are
   * two separate asynchronous steps with a real gap between them (the OS
   * actually contacting FCM/APNs); a sign-out can land in that gap. Without
   * checking `currentUser()` here, that race would register a token for an
   * account nobody is signed into anymore: the `effect()`'s sign-out run
   * already happened and found `registeredToken()` still `null` (this
   * callback hadn't fired yet), so `deregisterFromPush()` correctly no-op'd
   * having nothing to undo yet, and only *then* would this callback go on
   * to register the token regardless, leaving it stuck registered with no
   * further sign-out transition left to catch it. Checking here instead
   * closes that gap: the token is simply never registered at all if nobody
   * is signed in anymore by the time it arrives.
   */
  private handleTokenReceived(token: PushToken): void {
    if (!this.auth.currentUser()) {
      return;
    }
    this.registeredToken.set(token.value);
    this.devices.registerDevice(token.value, this.currentPlatform()).subscribe({ error: () => undefined });
  }

  /**
   * Sets up every listener this service cares about, exactly once for the
   * lifetime of this singleton. Mirrors `ConnectivityService`'s handling of
   * `DestroyRef`: the cleanup callback is registered synchronously, before
   * any `await`, so a teardown racing ahead of listener setup (a short-lived
   * injector, as in a unit test) still removes every listener that manages
   * to attach instead of leaking it.
   */
  private attachListeners(): void {
    let destroyed = false;
    const handles: PluginListenerHandle[] = [];

    this.destroyRef.onDestroy(() => {
      destroyed = true;
      for (const handle of handles) {
        void handle.remove();
      }
    });

    void this.setUpListeners((handle) => {
      if (destroyed) {
        void handle.remove();
        return;
      }
      handles.push(handle);
    });
  }

  private async setUpListeners(onHandle: (handle: PluginListenerHandle) => void): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    onHandle(await PushNotifications.addListener('registration', (token: PushToken) => this.handleTokenReceived(token)));

    onHandle(
      await PushNotifications.addListener('registrationError', () => {
        // Registration can fail for reasons entirely outside this app's
        // control (no reachable push service, misconfigured FCM/APNs
        // credentials server-side). There is no `AppError`-worthy UI for a
        // background capability like this one, so this is swallowed the
        // same way `registerForPush()` swallows a denied permission.
      }),
    );

    // Foreground delivery: the OS never shows a push notification banner
    // itself while the app is in the foreground, so this app has to render
    // its own via `@capacitor/local-notifications`, forwarding the original
    // push's `data` payload through as that local notification's own
    // `extra` field. Without that forwarding, tapping the local
    // notification scheduled here would have no `postId` to deep-link with,
    // since `LocalNotificationSchema` and `PushNotificationSchema` are two
    // unrelated shapes and the plugin does not carry one into the other on
    // its own.
    onHandle(
      await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        void this.showForegroundNotification(notification);
      }),
    );

    // Background/terminated delivery: the OS already showed the
    // notification itself before the user tapped it, so there is no local
    // notification in this path at all, only the original push's own
    // `data`.
    onHandle(
      await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: PushNotificationActionPerformed) => {
          this.navigateToPost(action.notification.data);
        },
      ),
    );

    // Foreground-received-then-tapped: the user tapped the local
    // notification `showForegroundNotification` scheduled above, not the
    // original push, so the `postId` is read back out of `extra`, not `data`.
    onHandle(
      await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (action: LocalNotificationActionPerformed) => {
          this.navigateToPost(action.notification.extra);
        },
      ),
    );
  }

  private async showForegroundNotification(notification: PushNotificationSchema): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: this.nextLocalNotificationId++,
          title: notification.title ?? this.translate.instant('notifications.defaultTitle'),
          body: notification.body ?? this.translate.instant('notifications.defaultBody'),
          extra: notification.data,
        },
      ],
    });
  }

  /**
   * Shared by both tap-handling paths above (`pushNotificationActionPerformed`
   * and `localNotificationActionPerformed`): whichever one fired, the only
   * thing this app does about it is navigate to the post the payload names,
   * via the same `Router` every other page already uses (see
   * `PostDetailPage.onDelete()`), not some separate native navigation API.
   *
   * The API Contract does not define a push/local-notification payload
   * shape (it is not one of the REST endpoints in the Contract, since the
   * payload is whatever the backend's own FCM/APNs message body contains),
   * so `{ postId: string }` is this client's own assumption about what the
   * backend includes when a push is about a specific post (for example, a
   * new comment notification). A backend sending a differently-shaped
   * payload, or one with no `postId` at all (an announcement push, say),
   * simply results in no navigation, rather than a thrown error.
   */
  private navigateToPost(data: unknown): void {
    const postId = this.extractPostId(data);
    if (!postId) {
      return;
    }
    void this.router.navigate(['/posts', postId]);
  }

  private extractPostId(data: unknown): string | null {
    if (!data || typeof data !== 'object' || !('postId' in data)) {
      return null;
    }
    const { postId } = data as { postId?: unknown };
    return typeof postId === 'string' ? postId : null;
  }

  private currentPlatform(): DevicePlatform {
    return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  }
}
