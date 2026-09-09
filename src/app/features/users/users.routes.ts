import { Routes } from '@angular/router';

/**
 * Placeholder until feature/users adds ProfilePage/EditProfilePage. The route's
 * `data.label` is bound to PlaceholderPageComponent's `label` input by
 * withComponentInputBinding() in app.config.ts.
 */
export const USERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { label: 'Profile' },
  },
];
