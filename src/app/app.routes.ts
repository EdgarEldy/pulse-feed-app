import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

/**
 * Top-level route table. Every feature is lazy-loaded via loadChildren so its
 * chunk (and everything it imports) is only fetched once someone actually
 * navigates there. Each feature's *.routes.ts currently points at
 * PlaceholderPageComponent; feature/auth, feature/posts, and feature/users
 * will replace those entries with real pages without needing to touch this
 * file again.
 *
 * `authGuard` is applied per the Screens tables across the branches
 * specified so far: `FeedPage` (`feed`) and `PostDetailPage` (`posts/:id`,
 * both served by `posts.routes.ts`, hence guarding both the `feed` and
 * `posts` entries here) and `ProfilePage` (`profile/:id`) are all listed
 * "Authenticated". `login` is deliberately left unguarded, it is the one
 * route someone without a session must be able to reach.
 */
export const routes: Routes = [
  {
    path: '',
    redirectTo: 'feed',
    pathMatch: 'full',
  },
  {
    path: 'feed',
    canActivate: [authGuard],
    loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
  },
  {
    path: 'posts',
    canActivate: [authGuard],
    loadChildren: () => import('./features/posts/posts.routes').then((m) => m.POSTS_ROUTES),
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'profile/:id',
    canActivate: [authGuard],
    loadChildren: () => import('./features/users/users.routes').then((m) => m.USERS_ROUTES),
  },
  {
    path: '**',
    redirectTo: 'feed',
  },
];
