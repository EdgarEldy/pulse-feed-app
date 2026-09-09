import { Routes } from '@angular/router';

/**
 * `''` is mounted at `/login` by `app.routes.ts`, so `LoginPage` renders at
 * `/login` itself and `RegisterPage` at `/login/register` (the link
 * `LoginPage` points "don't have an account" at, and the one `RegisterPage`
 * navigates back from on "already have an account"). Neither route carries
 * `authGuard`: both are the entry points someone without a session is
 * supposed to reach.
 */
export const AUTH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
  },
];
