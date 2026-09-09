import { Observable, catchError, from, map, of, switchMap } from 'rxjs';
import { AppError } from '../models/app-error';

export type OfflineFirstResult<T> = { status: 'success'; data: T } | { status: 'error'; error: AppError };

/**
 * The remote-then-cache-fallback-then-write-through sequence every
 * `<Feature>Service.loadX()` needs, written once instead of once per
 * feature. Deliberately a plain function, not a service: it has no state
 * of its own (no signal, no injected dependency, nothing that needs a
 * singleton instance or `inject()`), it just sequences three functions its
 * caller already owns (`remote`/`cacheRead`/`cacheWrite`) with one policy
 * applied consistently. Making it a service would only add ceremony
 * (constructor, `providedIn: 'root'`, a test-only reason to mock it)
 * without buying anything a plain function does not already give for free.
 */
export function loadOfflineFirst<T>(options: {
  remote: () => Observable<T>;
  cacheRead: () => Promise<T>;
  cacheWrite: (data: T) => void | Promise<void>;
}): Observable<OfflineFirstResult<T>> {
  return options.remote().pipe(
    switchMap((data) =>
      from(Promise.resolve(options.cacheWrite(data))).pipe(map(() => ({ status: 'success', data }) as const)),
    ),
    catchError((error: AppError) => {
      // Only a network failure means "we simply couldn't reach the
      // server right now" — the one case where showing whatever is
      // already cached is a reasonable stand-in for a fresh response.
      // Every other AppError kind (unauthorized, server, validation, and
      // even a prior cache failure) means the server was reachable and
      // said something specific, or the response itself was malformed;
      // silently swapping that for stale cached data would hide a real
      // problem (an expired session, a genuine server error) behind a
      // screen that looks like everything is fine.
      if (error.kind !== 'network') {
        return of({ status: 'error', error }) as Observable<OfflineFirstResult<T>>;
      }
      return from(options.cacheRead()).pipe(
        map((data) => ({ status: 'success', data }) as const),
        catchError(() => {
          const cacheError: AppError = { kind: 'cache', message: 'No cached data available while offline.' };
          return of({ status: 'error', error: cacheError }) as Observable<OfflineFirstResult<T>>;
        }),
      );
    }),
  );
}
