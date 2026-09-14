import { AnimationTriggerMetadata, animate, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonBadge, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline, syncOutline, trashOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { PostRow } from '../../../features/posts/post.model';
import { postHeroId } from '../../../features/posts/post-hero-transition.util';
import { LikeButtonComponent } from '../../../features/likes/components/like-button/like-button.component';
import { CachedImageDirective } from '../../directives/cached-image.directive';
import { AppCardComponent } from '../app-card/app-card.component';

addIcons({ 'create-outline': createOutline, 'trash-outline': trashOutline, 'sync-outline': syncOutline });

/**
 * This branch's explicit "Animate PostCardComponent entry with the Angular
 * Animations API" task. `:enter` is Angular's alias for "this element was
 * just inserted by a structural directive or `@if`/`@for` block", which is
 * exactly what happens every time `FeedPage` renders a fresh page of
 * results, or `PostsService.createPost()` optimistically prepends a new
 * row to the `posts` signal: this trigger, bound to the component's own
 * host element below, fades and slides each new card in instead of having
 * it pop into place instantly.
 */
const postCardEnterAnimation: AnimationTriggerMetadata = trigger('postCardEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(12px)' }),
    animate('220ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

/**
 * A single feed item: author row, title/content, and an optional image,
 * built on top of `AppCardComponent`'s layout and `CachedImageDirective`
 * for both the avatar and the post image. Deliberately dumb: it takes a
 * `PostRow` and renders it, and emits `edit`/`delete` for a host page to
 * wire to `PostsService` rather than talking to any service itself, which
 * is what keeps it reusable across `FeedPage`, `ProfilePage`'s post list,
 * and anywhere else a post needs to render the same way.
 */
@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [AppCardComponent, CachedImageDirective, DatePipe, IonBadge, IonButton, IonIcon, LikeButtonComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-card.component.html',
  styleUrl: './post-card.component.scss',
  animations: [postCardEnterAnimation],
  host: { '[@postCardEnter]': '' },
})
export class PostCardComponent {
  readonly post = input.required<PostRow>();

  /**
   * Bound to `.post-card__image` in the template as `[attr.data-post-hero]`.
   * `PostDetailPage`'s own post image carries the same attribute, keyed the
   * same way; `postHeroTransition` (`features/posts/post-hero-transition.util.ts`)
   * looks for a matching pair of these across a navigation to know when to
   * run the feed-thumbnail-to-detail-image hero animation instead of the
   * platform's default page transition.
   */
  protected readonly postHeroId = postHeroId;

  /**
   * Whether the signed-in user authored this post. Purely informational
   * from this component's point of view: the actual "is this the author"
   * check belongs to whichever page hosts this card (`FeedPage`,
   * `PostDetailPage`, a parallel task on this branch), since that is where
   * `AuthService.currentUser` and `post().authorId` are both naturally
   * already in scope together. This component's own job is narrower, see
   * `canManage` below.
   */
  readonly isOwnPost = input(false);

  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly delete = new EventEmitter<void>();

  /**
   * README's "Reconciling writes made offline" section, verbatim: "A post
   * ... still carrying a temporary id (pendingSync: true) cannot be edited
   * or deleted... hide those actions and show a small pending indicator
   * instead, until onSynced replaces the temporary row." `isOwnPost` alone
   * is therefore never sufficient to show edit/delete: a post still
   * syncing hides them regardless of who is looking at it, the author
   * included, hence the `&&` rather than treating `isOwnPost` as the only
   * gate.
   */
  readonly canManage = computed(() => this.isOwnPost() && !this.post().pendingSync);

  onEdit(): void {
    this.edit.emit();
  }

  onDelete(): void {
    this.delete.emit();
  }
}
