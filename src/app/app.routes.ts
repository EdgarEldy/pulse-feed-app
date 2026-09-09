import { Routes } from '@angular/router';

/**
 * Top-level route table. Every feature is lazy-loaded via loadChildren so its
 * chunk (and everything it imports) is only fetched once someone actually
 * navigates there. Each feature's *.routes.ts currently points at
 * PlaceholderPageComponent; feature/auth, feature/posts, and feature/users
 * will replace those entries with real pages without needing to touch this
 * file again.
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'feed',
    pathMatch: 'full',
  },
  {
    path: 'feed',
    loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
  },
  {
    path: 'posts',
    loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'profile/:id',
    loadChildren: () => import('./features/users/users.routes').then((m) => m.USERS_ROUTES),
  },
  {
    path: '**',
    redirectTo: 'feed',
  },
];
