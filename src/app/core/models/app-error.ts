/**
 * Every failure the app can surface to a user or a facade service's state
 * signal is normalized into one of these kinds. Components branch on `kind`
 * instead of on an HTTP status code or a caught exception type, so a
 * template can render "you're offline" versus "something went wrong on our
 * end" without knowing anything about `HttpErrorResponse`.
 */
export type AppErrorKind = 'network' | 'server' | 'unauthorized' | 'cache' | 'validation';

export interface AppError {
  kind: AppErrorKind;
  message: string;
  statusCode?: number;
}
