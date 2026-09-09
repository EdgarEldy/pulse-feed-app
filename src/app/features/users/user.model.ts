/**
 * The `User` type as the rest of the app works with it: components, the
 * `UsersService` facade, and every other feature that just needs to show
 * an author's name/avatar all import this, not `UserDto`. Deliberately a
 * plain interface with no Angular/HttpClient import, so it can be shared
 * by any layer (including a future `*LocalService`) without dragging in
 * framework code.
 *
 * `createdAt` stays a `string`: the wire sends an ISO 8601 timestamp and
 * this app never converts it to a `Date` object, templates read the ISO
 * string directly (formatting, if ever needed, happens at render time).
 */
export interface User {
  id: string;
  displayName: string;
  email: string;
  photoUrl: string;
  createdAt: string;
}
