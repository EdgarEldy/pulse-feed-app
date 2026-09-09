import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../features/auth/auth.service';

/**
 * Protects every top-level route that requires a signed-in session (see
 * README's Auth Model: "A `CanActivateFn` guard reading
 * `AuthService.isAuthenticated`"). `app.routes.ts` applies this to `feed`,
 * `posts` (and therefore `posts/:id`), and `profile/:id`; `login` itself is
 * deliberately left unguarded, it is the one place someone without a
 * session is supposed to land.
 *
 * Returning `false` here would technically also block navigation, but it
 * leaves the router exactly where it already was: the URL bar would show
 * `/feed` while nothing renders, with no way back to a page that can start
 * a session. Returning a `UrlTree` instead (built via
 * `router.createUrlTree(...)`) is the idiomatic way for a `CanActivateFn`
 * to redirect: the router treats a returned `UrlTree` as "cancel this
 * navigation and navigate to this one instead", performing the redirect as
 * part of the same navigation cycle rather than needing a second,
 * guard-triggered `router.navigate(...)` call.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
