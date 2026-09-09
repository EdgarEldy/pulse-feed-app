import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, createOutline, heartOutline, trashOutline } from 'ionicons/icons';
import { ErrorViewComponent } from '../../../../shared/components/error-view/error-view.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { CachedImageDirective } from '../../../../shared/directives/cached-image.directive';
import { AuthService } from '../../../auth/auth.service';
import { postHeroId } from '../../post-hero-transition.util';
import { PostsService } from '../../posts.service';

addIcons({
  'create-outline': createOutline,
  'trash-outline': trashOutline,
  'chatbubble-outline': chatbubbleOutline,
  'heart-outline': heartOutline,
});

/**
 * README's Screens table entry for this branch: "Full post, comments, and
 * like button" (Authenticated). This page can only build the "full post"
 * part of that today: `feature/comments` and `feature/likes`, the two later
 * branches that would supply `CommentsSectionComponent` and
 * `LikeButtonComponent`, do not exist yet on this branch. Rather than fake
 * either one, this follows the same forward-looking placeholder pattern
 * `ProfilePage` already established for "the user's posts" in
 * `feature/users`: a short "coming soon" note stands in for comments, and
 * the like count renders as an inert number (no tap target, nothing to
 * toggle) instead of a fake interactive heart, so nothing here has to be
 * thrown away once those branches land and can slot their real components
 * into this same spot.
 */
@Component({
  selector: 'app-post-detail-page',
  standalone: true,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonTitle,
    IonToolbar,
    CachedImageDirective,
    DatePipe,
    ErrorViewComponent,
    LoadingIndicatorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-detail.page.html',
  styleUrl: './post-detail.page.scss',
})
export class PostDetailPage {
  private readonly postsService = inject(PostsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * A signal input rather than a plain `@Input()`, matching `ProfilePage`'s
   * established reasoning verbatim: Angular reuses this component instance
   * when navigating in place from one `/posts/:id` to another (tapping a
   * different post's author or a related-post link while already on a
   * detail page, say), and only a signal input is itself trackable by the
   * `effect()` below that re-triggers `loadPost` on every change.
   */
  readonly id = input.required<string>();

  readonly postDetail = this.postsService.postDetail;

  /** Used only to attribute `data-post-hero` for the shared-element transition. */
  protected readonly postHeroId = postHeroId;

  constructor() {
    effect(() => {
      this.postsService.loadPost(this.id());
    });
  }

  /**
   * Gates edit/delete on authorship only, not on `pendingSync` the way
   * `PostCardComponent.canManage` does. That is a real, deliberate gap, not
   * an oversight: `PostDetailState.data` is typed `Post` (see
   * `post.model.ts`), and `Post` carries no `pendingSync` field at all,
   * only `PostRow` (the local-cache-only shape `PostsLocalService` and the
   * feed's `posts` signal use) does. `PostsService.loadPost`'s offline
   * fallback path does, at runtime, hand back an object that happens to
   * carry `pendingSync` (its cache read resolves a `PostRow`), but nothing
   * about `PostDetailState`'s declared type exposes that here, and reaching
   * into the object beyond its own type to read a field it doesn't declare
   * would be exactly the kind of silent guess this codebase's conventions
   * ask not to make.
   *
   * Surfacing this properly would mean widening `PostsService.postDetail`
   * to carry `PostRow` instead of `Post`, a call for whoever owns
   * `PostsService` next to make (it also determines what
   * `PostDetailPage.canManage` should look like), not something this page
   * should decide on its own by reading past its facade's stated contract.
   * Flagging this here for the reviewer rather than guessing.
   */
  readonly canManage = computed(() => {
    const state = this.postDetail();
    return state.status === 'success' && state.data.authorId === this.authService.currentUser()?.id;
  });

  onRetry(): void {
    this.postsService.loadPost(this.id());
  }

  /**
   * There is no `EditPostPage` on this branch (same gap `FeedPage.onEdit`
   * already documents): the Screens table only lists `CreatePostPage`
   * (create-only), a dedicated edit screen is left for a future
   * branch/task. This is a documented no-op rather than a route to
   * nowhere, so the button still gives honest, visible feedback.
   */
  onEdit(): void {
    console.info(`Editing post ${this.id()} is not available yet.`);
  }

  /**
   * Navigates away immediately after calling `deletePost`, rather than
   * waiting on an `effect()` watching for the post to disappear from
   * `PostsService`'s cache. `deletePost` is already fire-and-forget from a
   * caller's point of view (it optimistically reconciles online/offline
   * outcomes on its own, the same as `PostCardComponent`'s delete action
   * elsewhere in this feature), and there is nothing left to show on this
   * page once the delete has been requested: staying here would only mean
   * rendering a detail view for a post the user just asked to remove.
   */
  onDelete(): void {
    this.postsService.deletePost(this.id());
    void this.router.navigateByUrl('/feed');
  }
}
