import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../features/auth/auth.service';
import { SecureTokenStorageService } from '../storage/secure-token-storage.service';
import { apiEndpoints } from './api-endpoints';

/**
 * This interceptor is registered globally (`app.config.ts`'s
 * `provideHttpClient(withInterceptors([authInterceptor]))` applies to every
 * `HttpClient` call in the app, not just calls to PulseFeed's own backend.
 * `AppTranslateLoader` (`core/i18n/app-translate-loader.ts`), for instance,
 * fetches bundled i18n JSON assets over the same `HttpClient`. Without this
 * check, that unrelated request would get the access token attached and
 * would enter the refresh/retry/sign-out flow on an unexpected error, and
 * any future call to a third-party or cross-origin URL would silently leak
 * the bearer token to it. Everything below only ever runs for a request
 * whose URL actually targets this app's own API.
 */
function isApiRequest(url: string): boolean {
  return url.startsWith(environment.apiBaseUrl);
}

/**
 * Requests that must go out without an `Authorization` header, and must
 * never trigger the refresh-on-`401` flow below: `register`/`login` happen
 * before any token exists, and `refresh` is the call that *produces* a new
 * access token, so attaching a possibly-expired one to it achieves nothing
 * and could confuse a backend that expects a bare `{ refreshToken }` body
 * there instead of a bearer header. Every other endpoint, including
 * `/auth/logout`, is treated as authenticated per the API Contract's "all
 * authenticated endpoints expect `Authorization: Bearer <accessToken>`".
 */
const UNAUTHENTICATED_AUTH_PATHS = [apiEndpoints.auth.register, apiEndpoints.auth.login, apiEndpoints.auth.refresh];

function isUnauthenticatedAuthRequest(url: string): boolean {
  return UNAUTHENTICATED_AUTH_PATHS.some((path) => url.endsWith(path));
}

/**
 * `/auth/logout` still needs `Authorization` attached (it is an
 * authenticated endpoint per the API Contract), but must never trigger the
 * refresh-and-retry flow below. `AuthService.signOut()` calls this endpoint
 * as part of clearing a session, including the exact case where a refresh
 * just failed; without this exclusion, a `401` here would call
 * `refreshSession()` again with the same already-known-bad refresh token,
 * which would fail again, calling `signOut()` again, which would call this
 * endpoint again, recursing indefinitely instead of the single silent
 * failure `signOut()`'s own `catchError` already expects and handles.
 */
function isLogoutRequest(url: string): boolean {
  return url.endsWith(apiEndpoints.auth.logout);
}

function withAuthorization(req: HttpRequest<unknown>, accessToken: string | null): HttpRequest<unknown> {
  if (!accessToken) {
    return req;
  }
  return req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } });
}

/**
 * Attaches the stored access token to every outgoing request (except the
 * three listed above) and transparently recovers from a `401`: refresh the
 * session once, retry the original request once with the new token, and
 * sign the user out if the refresh itself could not produce a new token.
 *
 * The concurrent-`401` sharing README's Auth Model calls for ("only the
 * first triggers `/auth/refresh`; the rest wait on that same in-flight
 * `Observable`") is not implemented here at all: this interceptor calls
 * `authService.refreshSession()` exactly the same way on every `401` it
 * sees, with no dedup logic of its own. `AuthService.refreshSession()`'s own
 * `shareReplay(1)` memoization is what makes several concurrent calls to it
 * collapse onto the one in-flight `/auth/refresh` request; see that
 * method's own comment for the full mechanism. Keeping that entirely inside
 * `AuthService` is deliberate: the interceptor should not need to know a
 * refresh is even shared to behave correctly, it just calls the method.
 */
export const authInterceptor: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  if (!isApiRequest(req.url)) {
    return next(req);
  }

  const tokenStorage = inject(SecureTokenStorageService);
  const authService = inject(AuthService);

  if (isUnauthenticatedAuthRequest(req.url)) {
    return next(req);
  }

  return from(tokenStorage.getAccessToken()).pipe(
    switchMap((accessToken) => next(withAuthorization(req, accessToken))),
    catchError((error: unknown) => handleRequestError(req, next, authService, error)),
  );
};

function handleRequestError(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  error: unknown,
): Observable<HttpEvent<unknown>> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
    return throwError(() => error);
  }

  if (isLogoutRequest(req.url)) {
    return throwError(() => error);
  }

  return authService.refreshSession().pipe(
    // Only `refreshSession()`'s own failure lands here: this `catchError`
    // sits before the retry's `switchMap` below, so a `401` from the
    // *retried* request (a definitive failure, not a refreshable one) never
    // reaches it and is never mistaken for a failed refresh. That is what
    // keeps this a single retry rather than a loop: a second `401`, after
    // an already-successful refresh, simply propagates from the `switchMap`
    // below with nothing here left to catch it a second time.
    catchError(() => {
      authService.signOut();
      return throwError(() => error);
    }),
    switchMap((accessToken) => next(withAuthorization(req, accessToken))),
  );
}
