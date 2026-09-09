import { Routes } from '@angular/router';

/**
 * Mounted at `/profile/:id` by `app.routes.ts`. `path: ''` here (rather
 * than repeating `:id`) relies on the router's default
 * `paramsInheritanceStrategy` ('emptyOnly'): an empty-path child route
 * inherits its parent's already-matched params, so `ProfilePage`'s `id`
 * input still resolves to the `:id` segment `app.routes.ts` captured,
 * without a redundant second `:id` segment in this feature's own route
 * table.
 *
 * `edit` resolves to `/profile/:id/edit`, nested under whichever profile
 * the user navigated from so "back" naturally returns to that same
 * profile. `EditProfilePage` never actually reads the `:id` segment,
 * though: per the Screens table, it is "Owner only" and always edits the
 * signed-in user's own account (`AuthService.currentUser`), regardless of
 * which profile's `:id` happens to be in the URL. A top-level route like
 * `/settings/profile` would have avoided that mismatch between the URL's
 * `:id` and the account actually being edited, but nesting under the
 * profile someone is already looking at keeps the "view my profile ->
 * edit it" flow a single relative navigation, which is the more common
 * path through this feature; either choice needs this same caveat
 * documented somewhere, so it is documented here rather than reworking
 * the route shape.
 */
export const USERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'edit',
    loadComponent: () => import('./pages/edit-profile/edit-profile.page').then((m) => m.EditProfilePage),
  },
];
