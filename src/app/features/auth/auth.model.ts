import { User } from '../users/user.model';

/**
 * What `AuthService` holds after a successful `register`/`login`/`google`
 * call: both tokens plus the `User` who just signed in, matching the
 * response shape documented in the API Contract for those three
 * endpoints. Not one of the four core domain entities, but real API
 * Contract data all the same, so it lives alongside the rest of the
 * app's shared types rather than being redeclared inline wherever a
 * session is handled.
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

/**
 * `POST /auth/refresh`'s response: just a new access token, the refresh
 * token and user are unchanged and not re-sent. Kept as its own type
 * instead of `Pick<AuthSession, 'accessToken'>` so it reads as "this is
 * the refresh response" at every call site, not as a derived shape.
 */
export interface RefreshedSession {
  accessToken: string;
}
