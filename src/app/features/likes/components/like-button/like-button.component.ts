import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  AnimationTriggerMetadata,
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { heart, heartOutline } from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LikesService } from '../../likes.service';

addIcons({ heart, 'heart-outline': heartOutline });

const heartBeatAnimation: AnimationTriggerMetadata = trigger('heartBeat', [
  state('true', style({ transform: 'scale(1)' })),
  state('false', style({ transform: 'scale(1)' })),
  transition('false => true', [
    animate('100ms ease-in', style({ transform: 'scale(1.4)' })),
    animate('100ms ease-out', style({ transform: 'scale(1)' })),
  ]),
  transition('true => false', [
    animate('80ms ease-out', style({ transform: 'scale(0.85)' })),
    animate('80ms ease-in', style({ transform: 'scale(1)' })),
  ]),
]);

@Component({
  selector: 'app-like-button',
  standalone: true,
  imports: [IonButton, IonIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './like-button.component.html',
  styleUrl: './like-button.component.scss',
  animations: [heartBeatAnimation],
})
export class LikeButtonComponent implements OnInit {
  readonly postId = input.required<string>();
  readonly initialLikesCount = input<number>(0);
  readonly initialIsLiked = input<boolean>(false);

  private readonly likesService = inject(LikesService);
  private readonly translate = inject(TranslateService);

  readonly likeState = computed(() => this.likesService.states().get(this.postId()));

  /**
   * `aria-label` overrides the button's accessible name entirely, which
   * would otherwise silently drop both the liked/unliked state and the
   * visible count from what a screen reader announces (the visible `<span>`
   * count is marked `aria-hidden` in the template for exactly this reason).
   * Combining both into one computed label, rather than leaving the count
   * only visible, is this component's fix for that gap. `currentLang()` is
   * read purely to give this computed a dependency on the active language,
   * since `instant()` itself does not participate in signal tracking.
   */
  readonly ariaLabel = computed(() => {
    this.translate.currentLang();
    const liked = this.likeState()?.isLiked ?? this.initialIsLiked();
    const count = this.likeState()?.likesCount ?? this.initialLikesCount();
    const stateLabel = this.translate.instant(liked ? 'likes.unlike' : 'likes.like');
    const countLabel = this.translate.instant('likes.count', { count });
    return `${stateLabel}, ${countLabel}`;
  });

  ngOnInit(): void {
    this.likesService.initPost(this.postId(), this.initialLikesCount(), this.initialIsLiked());
  }

  onTap(event: Event): void {
    event.stopPropagation();
    this.likesService.toggle(this.postId());
  }
}
