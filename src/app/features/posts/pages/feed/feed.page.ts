import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, cloudOfflineOutline, newspaperOutline } from 'ionicons/icons';
import { ConnectivityService } from '../../../../core/network/connectivity.service';
import { AdaptiveGridComponent } from '../../../../shared/components/adaptive-grid/adaptive-grid.component';
import { ErrorViewComponent } from '../../../../shared/components/error-view/error-view.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { PostCardComponent } from '../../../../shared/components/post-card/post-card.component';
import { AuthService } from '../../../auth/auth.service';
import { Post, PostRow } from '../../post.model';
import { PostsService } from '../../posts.service';

addIcons({
  'add-outline': addOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'newspaper-outline': newspaperOutline,
});

/**
 * README's Screens table entry for this branch: "Paginated list of posts,
 * newest first" (Authenticated). This is the app's home route (`''` under
 * both `/feed` and `/posts`, see `posts.routes.ts`/`app.routes.ts`), so it
 * owns loading the feed once on init rather than waiting for a parent route
 * to do it.
 *
 * Every piece of state this page renders comes from `PostsService.posts`;
 * this page never injects `PostsApiService`/`PostsLocalService` itself, and
 * `PostCardComponent` never talks to `PostsService` either, it only emits
 * `edit`/`delete` for this page to act on.
 */
@Component({
  selector: 'app-feed-page',
  standalone: true,
  imports: [
    RouterLink,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonRefresher,
    IonRefresherContent,
    IonTitle,
    IonToolbar,
    AdaptiveGridComponent,
    ErrorViewComponent,
    LoadingIndicatorComponent,
    PostCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feed.page.html',
  styleUrl: './feed.page.scss',
})
export class FeedPage {
  private readonly postsService = inject(PostsService);
  private readonly authService = inject(AuthService);
  private readonly connectivityService = inject(ConnectivityService);

  readonly posts = this.postsService.posts;
  readonly isOnline = this.connectivityService.isOnline;

  /** `post.authorId === currentUserId()` is exactly the rule this branch's
   * task list spells out for `PostCardComponent`'s `isOwnPost` input; kept
   * as a computed here (rather than inline per-card arithmetic) so it is
   * derived from `AuthService.currentUser` exactly once per change, not
   * once per card on every change detection pass. */
  private readonly currentUserId = computed(() => this.authService.currentUser()?.id ?? null);

  /**
   * The in-flight `ion-refresher`/`ion-infinite-scroll` event, if any,
   * waiting to be told the load it triggered has finished. Not a signal:
   * these are DOM event objects, not state the template reads, so a plain
   * field is enough, the `effect()` below is what actually reacts to state.
   */
  private refresherEvent: RefresherCustomEvent | null = null;
  private infiniteScrollEvent: InfiniteScrollCustomEvent | null = null;

  constructor() {
    this.postsService.loadPosts();

    /**
     * `loadPosts()` always resets `posts()` to `{ status: 'loading' }`, and
     * `loadMore()` always replaces it with a fresh `{ status: 'success' |
     * 'error', ... }` object, so both a pull-to-refresh and a "load more"
     * scroll eventually make this signal stop being `'loading'`. This one
     * effect watches for exactly that, and completes whichever Ionic
     * control (refresher, infinite scroll, or neither) is currently
     * waiting on it, instead of two separate effects duplicating the same
     * "did the load finish" check.
     */
    effect(() => {
      const state = this.posts();
      if (state.status === 'loading') {
        return;
      }
      this.refresherEvent?.target.complete();
      this.refresherEvent = null;
      this.infiniteScrollEvent?.target.complete();
      this.infiniteScrollEvent = null;
    });
  }

  isOwnPost(post: PostRow): boolean {
    return post.authorId === this.currentUserId();
  }

  onRefresh(event: RefresherCustomEvent): void {
    this.refresherEvent = event;
    this.postsService.loadPosts();
  }

  onLoadMore(event: InfiniteScrollCustomEvent): void {
    this.infiniteScrollEvent = event;
    this.postsService.loadMore();
  }

  onRetry(): void {
    this.postsService.loadPosts();
  }

  /**
   * There is no `EditPostPage` on this branch: the Screens table only lists
   * `CreatePostPage` (create-only), a dedicated edit screen is left for a
   * future branch/task to add. Until then this is a documented no-op
   * rather than a route to nowhere, so tapping "edit" on a card gives
   * visible, honest feedback instead of silently failing to navigate.
   */
  onEdit(post: Post): void {
    console.info(`Editing post ${post.id} is not available yet.`);
  }

  onDelete(post: Post): void {
    this.postsService.deletePost(post.id);
  }
}
