import { Routes } from '@angular/router';

/**
 * Placeholder until feature/posts adds FeedPage/PostDetailPage. Both the feed
 * (`''`) and the post detail (`':id'`) entries point at the same shared
 * placeholder for now; the route's `data.label` is bound to
 * PlaceholderPageComponent's `label` input by withComponentInputBinding() in
 * app.config.ts.
 */
export const POSTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { label: 'Feed' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('../../shared/components/placeholder-page/placeholder-page.component').then(
        (m) => m.PlaceholderPageComponent,
      ),
    data: { label: 'Post detail' },
  },
];
