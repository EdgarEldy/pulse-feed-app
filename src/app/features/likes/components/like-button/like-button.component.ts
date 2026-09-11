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
import { LikesService } from '../../likes.service';

addIcons({ heart, 'heart-outline': heartOutline });

const heartBeatAnimation: AnimationTriggerMetadata = trigger('heartBeat', [
  state('true', style({ transform: 'scale(1)' })),
  state('false', style({ transform: 'scale(1)' })),
  transition('false => true', [
    animate('100ms ease-in', style({ transform: 'scale(1.4)' })),
    animate('100ms ease-out', style({ transform: 'scale(1)' })),
  ]),
]);

@Component({
  selector: 'app-like-button',
  standalone: true,
  imports: [IonButton, IonIcon],
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

  readonly likeState = computed(() => this.likesService.states().get(this.postId()));

  ngOnInit(): void {
    this.likesService.initPost(this.postId(), this.initialLikesCount(), this.initialIsLiked());
  }

  onTap(event: Event): void {
    event.stopPropagation();
    this.likesService.toggle(this.postId());
  }
}
