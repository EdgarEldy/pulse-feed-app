/**
 * Every failure the app can surface to a user or a facade service's state
 * signal is normalized into one of these kinds. Components branch on `kind`
 * instead of on an HTTP status code or a caught exception type, so a
 * template can render "you're offline" versus "something went wrong on our
 * end" without knowing anything about `HttpErrorResponse`.
 *
 * Checked against every failure mode the API Contract can produce
 * (README.md): a dropped connection or CORS failure is `network`
 * (`toAppError` maps HTTP status `0` here), an expired or missing token is
 * `unauthorized` (status `401`), and every other 4xx/5xx the backend can
 * return (bad request, not found, conflict, server error) is `server`,
 * carrying the backend's own `message` and `statusCode` through as-is so a
 * toast can show it directly. `validation` is not an HTTP status at all,
 * it fires when a response's own body fails its `zod` schema in
 * `BaseApiService`, before a facade service ever sees it. `cache` has no
 * producer yet, it exists for `feature/offline-and-sync`'s local SQLite
 * reads/writes, which are not part of the API Contract.
 */
export type AppErrorKind = 'network' | 'server' | 'unauthorized' | 'cache' | 'validation';

export interface AppError {
  kind: AppErrorKind;
  message: string;
  statusCode?: number;
}
