import { Routes } from '@angular/router';

/**
 * `''` renders `FeedPage`, `:id` renders `PostDetailPage`. `:id` is bound to
 * `PostDetailPage.id` by `withComponentInputBinding()` in app.config.ts, the
 * same mechanism `users.routes.ts` already relies on for `ProfilePage`.
 *
 * `create` is listed before `:id` deliberately: routes are matched in
 * order, and a literal segment has to come before a parameterized one it
 * would otherwise be swallowed by, or `/feed/create` would resolve to
 * `PostDetailPage` with `id: 'create'` instead of `CreatePostPage`.
 *
 * This same route table is mounted under both `feed` and `posts` in
 * app.routes.ts, so `FeedPage`/`CreatePostPage`/`PostDetailPage` are
 * reachable at both `/feed*` and `/posts*`; that duplication is expected,
 * not a bug to route around.
 */
export const POSTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/feed/feed.page').then((m) => m.FeedPage),
  },
  {
    path: 'create',
    loadComponent: () => import('./pages/create-post/create-post.page').then((m) => m.CreatePostPage),
  },
  {
    path: ':id',
    loadComponent: () => import('./pages/post-detail/post-detail.page').then((m) => m.PostDetailPage),
  },
];
