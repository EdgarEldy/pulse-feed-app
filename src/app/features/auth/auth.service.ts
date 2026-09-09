import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, from, of, shareReplay, switchMap, throwError } from 'rxjs';
import { AppError } from '../../core/models/app-error';
import { SecureTokenStorageService } from '../../core/storage/secure-token-storage.service';
import { User } from '../users/user.model';
import { AuthApiService } from './auth-api.service';
import { AuthSession } from './auth.model';

/**
 * State of the *last* `signIn`/`register` attempt, read by `LoginPage`/
 * `RegisterPage` to drive a spinner or an `ion-toast`. This is intentionally
 * separate from `currentUser`/`isAuthenticated` below: `AuthState` describes
 * "how did the most recent sign-in/registration call go", a short-lived
 * value that resets to `idle` the moment a new attempt starts, while
 * `currentUser` describes "is there a signed-in session right now", a value
 * that has to persist for as long as the session does (including across an
 * app restart, restored from storage, with no corresponding `signIn` call
 * ever having run in that process).
 *
 * README's Error Handling section establishes the `idle`/`loading`/`error`/
 * `success` discriminated-union shape for a facade's data state (`status:
 * 'success'; data: ...`). There is no data payload to carry on success here
 * (`currentUser` already holds the signed-in user once a call succeeds), so
 * `success` carries nothing beyond its `status` tag; the shape otherwise
 * follows that same precedent rather than inventing a differently-named
 * status set for auth specifically.
 */
export type AuthState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: AppError } | { status: 'success' };

/**
 * Facade for `features/auth`. `LoginPage`/`RegisterPage`/`authGuard`/
 * `authInterceptor` are the only things that should ever depend on this
 * service; none of them injects `AuthApiService` or
 * `SecureTokenStorageService` directly.
 *
 * Three responsibilities live here:
 *  - Driving `signIn`/`register`/`signOut`, each persisting the resulting
 *    session (or lack of one) via `SecureTokenStorageService` and updating
 *    `currentUser`.
 *  - Restoring `currentUser` from storage on app start (`restoreSession`,
 *    called from an `APP_INITIALIZER` in `app.config.ts`).
 *  - `refreshSession()`, the one piece `authInterceptor` calls directly:
 *    a single, shared, in-flight `/auth/refresh` call multiple concurrent
 *    `401`s can all await, rather than each firing its own.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApiService);
  private readonly tokenStorage = inject(SecureTokenStorageService);

  private readonly currentUserSignal = signal<User | null>(null);
  readonly currentUser: Signal<User | null> = this.currentUserSignal.asReadonly();
  readonly isAuthenticated: Signal<boolean> = computed(() => this.currentUserSignal() !== null);

  private readonly state = signal<AuthState>({ status: 'idle' });
  readonly authState: Signal<AuthState> = this.state.asReadonly();

  /**
   * `authState` is one signal shared by `LoginPage` and `RegisterPage`
   * alike (there is exactly one `AuthService` instance, `providedIn:
   * 'root'`). Without this, navigating from a failed registration straight
   * to the login screen (or back) would show the *other* page's stale
   * error toast the instant the new page mounts, since its constructor
   * `effect()` reacts to whatever `authState` already holds. Each page
   * calls this once, before registering that effect, so it always starts
   * from a clean `idle` state regardless of what the previous page left
   * behind.
   */
  resetState(): void {
    this.state.set({ status: 'idle' });
  }

  /**
   * The memoized in-flight `/auth/refresh` call. `null` whenever no refresh
   * is currently running; set the moment one starts, cleared the moment it
   * finishes (success or failure). See `refreshSession()` for how this
   * actually achieves the "one call shared by every concurrent `401`"
   * behavior README's Auth Model calls for.
   */
  private inFlightRefresh: Observable<string> | null = null;

  signIn(email: string, password: string): void {
    this.state.set({ status: 'loading' });
    this.api.login(email, password).pipe(switchMap((session) => this.persistSession(session))).subscribe({
      next: (session) => {
        this.currentUserSignal.set(session.user);
        this.state.set({ status: 'success' });
      },
      error: (error: AppError) => this.state.set({ status: 'error', error }),
    });
  }

  register(email: string, password: string, displayName: string): void {
    this.state.set({ status: 'loading' });
    this.api
      .register(email, password, displayName)
      .pipe(switchMap((session) => this.persistSession(session)))
      .subscribe({
        next: (session) => {
          this.currentUserSignal.set(session.user);
          this.state.set({ status: 'success' });
        },
        error: (error: AppError) => this.state.set({ status: 'error', error }),
      });
  }

  /**
   * Guards against running this more than once concurrently. Several
   * requests can hit `401` around the same moment against an already-
   * expired refresh token; `refreshSession()`'s shared `Observable` fails
   * only once, but RxJS still replays that one failure to every one of
   * `authInterceptor`'s subscribers, so without this flag each of them
   * would independently call `signOut()`, each reading the same
   * still-present refresh token and each firing its own `POST /auth/logout`
   * before the first call's `tokenStorage.clear()` even completes.
   */
  private signingOut = false;

  /**
   * Signs the user out locally regardless of whether the `POST
   * /auth/logout` call, or even `tokenStorage.clear()` itself, succeeds:
   * the whole point of signing out is that the app should no longer act as
   * this user, and there is nothing the caller can do about either call
   * failing except still clear the local session, so a failure at either
   * step is swallowed rather than surfaced through `authState`. The
   * server-side session (and the refresh token's validity) may briefly
   * outlive the local one if the logout request never reaches the backend,
   * but that is a backend-side cleanup concern, not something this client
   * can fix by retrying or queuing.
   */
  signOut(): void {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;

    from(this.tokenStorage.getRefreshToken())
      .pipe(
        switchMap((refreshToken) => (refreshToken ? this.api.logout(refreshToken).pipe(catchError(() => of(undefined))) : of(undefined))),
        switchMap(() => from(this.tokenStorage.clear()).pipe(catchError(() => of(undefined)))),
      )
      .subscribe(() => {
        this.currentUserSignal.set(null);
        this.state.set({ status: 'idle' });
        this.signingOut = false;
      });
  }

  /**
   * Called once, from an `APP_INITIALIZER` in `app.config.ts`, before the
   * app renders its first route.
   *
   * There is no `GET /auth/me` in the API Contract, so this cannot ask the
   * backend "who is this token for": the only way to restore `currentUser`
   * without a network round trip is from data already sitting in storage.
   * `SecureTokenStorageService.getUser()` is exactly that: the `User`
   * object from the last successful `register`/`login`/`refresh` response,
   * persisted alongside the tokens. Restoring from it directly is a
   * deliberate trade-off: the profile shown immediately after a cold start
   * may be briefly stale (an edit made from another device before this app
   * was reopened, for instance) until the next successful API call refreshes
   * it, but that is strictly better than the alternative of leaving
   * `currentUser` `null` (and the user bounced to the login screen) despite
   * genuinely still holding a valid session.
   *
   * "Valid access token" here means "present in storage", not "not yet
   * expired": actually decoding a JWT's expiry client-side would need a
   * decoding step this app has no dependency for, and is unnecessary anyway,
   * since `authInterceptor` already handles an access token that turns out
   * to be expired transparently (silent refresh, then retry) the moment the
   * restored session's first authenticated request goes out. Restoration at
   * startup only has to answer "was there a session at all", not "is it
   * still fresh".
   *
   * If an access token exists but the cached `User` does not (storage
   * corrupted, or partially cleared), there is nothing coherent to restore:
   * rather than surface a signed-in state with no profile behind it, this
   * clears whatever is left and leaves `currentUser` `null`, same as a
   * user who was never signed in.
   */
  async restoreSession(): Promise<void> {
    try {
      const accessToken = await this.tokenStorage.getAccessToken();
      if (!accessToken) {
        return;
      }

      const user = await this.tokenStorage.getUser();
      if (!user) {
        await this.tokenStorage.clear();
        return;
      }

      this.currentUserSignal.set(user);
    } catch {
      // This runs inside app.config.ts's provideAppInitializer, which
      // blocks the app's first render until the returned promise settles.
      // A rejected storage read (IndexedDbTokenStore.openDb() can reject on
      // the web build, e.g. Safari private browsing) must not become a
      // rejected initializer, that would leave the app stuck on a blank
      // screen forever instead of just failing to restore a session; the
      // safe fallback is the same as "no session was ever there".
    }
  }

  /**
   * Exchanges the stored refresh token for a new access token, called by
   * `authInterceptor` whenever a request comes back `401`.
   *
   * The concurrency problem this solves: several requests can hit `401`
   * around the same moment (a page that fires three parallel `GET`s the
   * instant the access token expires, say). Without coordination, each one
   * would independently call this method, and each would fire its own
   * `POST /auth/refresh`, three network calls doing the exact same thing,
   * with the last response to arrive silently overwriting the tokens the
   * other two just wrote.
   *
   * `inFlightRefresh` fixes that: the first caller finds it `null`, so it
   * builds the actual refresh `Observable` and stores it there before
   * returning it. Every other caller that arrives before that `Observable`
   * has completed finds `inFlightRefresh` already set and simply gets back
   * the *same* `Observable` reference. `shareReplay(1)` is what makes
   * sharing that reference actually work: without it, each new `subscribe()`
   * call (each interceptor invocation calls `.pipe(...)` and subscribes
   * independently) would re-run the whole chain from scratch and issue its
   * own HTTP request despite reusing the same `Observable` object.
   * `shareReplay(1)` instead multicasts a single underlying HTTP call to
   * every subscriber, replaying its one buffered emission to each of them
   * as they subscribe, including ones that subscribe after the call has
   * already resolved.
   *
   * That last part is also why `inFlightRefresh` is cleared again once the
   * call finishes (`finalize`, which runs on both success and error): a
   * `shareReplay(1)` that stayed referenced forever would keep replaying
   * that first resolved token (or that first error) to every future caller
   * forever, even long after that token itself has expired and a *new*
   * refresh is actually needed. Clearing the memo on completion means the
   * next `401`, in a later refresh cycle, finds `inFlightRefresh` `null`
   * again and starts a genuinely fresh call, while still deduplicating
   * everything concurrent with any single in-flight call.
   */
  refreshSession(): Observable<string> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const refresh$ = from(this.tokenStorage.getRefreshToken()).pipe(
      switchMap((refreshToken) => {
        if (!refreshToken) {
          return throwError(
            () => ({ kind: 'unauthorized', message: 'No refresh token available.' }) as AppError,
          );
        }
        return this.api
          .refresh(refreshToken)
          .pipe(switchMap((refreshed) => from(this.tokenStorage.setTokens(refreshed.accessToken, refreshToken)).pipe(switchMap(() => of(refreshed.accessToken)))));
      }),
      shareReplay(1),
      finalize(() => {
        this.inFlightRefresh = null;
      }),
    );

    this.inFlightRefresh = refresh$;
    return refresh$;
  }

  private async persistSession(session: AuthSession): Promise<AuthSession> {
    await Promise.all([this.tokenStorage.setTokens(session.accessToken, session.refreshToken), this.tokenStorage.setUser(session.user)]);
    return session;
  }
}
