import { Routes } from '@angular/router';

/**
 * Placeholder until feature/auth adds LoginPage/RegisterPage. The route's
 * `data.label` is bound to PlaceholderPageComponent's `label` input by
 * withComponentInputBinding() in app.config.ts.
 */
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { label: 'Auth' },
  },
];
