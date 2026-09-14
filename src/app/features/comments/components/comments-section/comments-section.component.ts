import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { IonButton, IonIcon, ModalController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { ErrorViewComponent } from '../../../../shared/components/error-view/error-view.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { AuthService } from '../../../auth/auth.service';
import { CommentRow } from '../../comment.model';
import { CommentsService } from '../../comments.service';
import { CommentInputComponent } from '../comment-input/comment-input.component';
import { CommentTileComponent } from '../comment-tile/comment-tile.component';

addIcons({ 'chatbubble-outline': chatbubbleOutline });

@Component({
  selector: 'app-comments-section',
  standalone: true,
  imports: [
    IonButton,
    IonIcon,
    LoadingIndicatorComponent,
    ErrorViewComponent,
    CommentTileComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comments-section.component.html',
  styleUrl: './comments-section.component.scss',
})
export class CommentsSectionComponent implements OnInit {
  readonly postId = input.required<string>();
  readonly postAuthorId = input.required<string>();

  private readonly commentsService = inject(CommentsService);
  private readonly authService = inject(AuthService);
  private readonly modalCtrl = inject(ModalController);

  readonly comments = this.commentsService.comments;

  ngOnInit(): void {
    this.commentsService.loadComments(this.postId());
  }

  onRetry(): void {
    this.commentsService.loadComments(this.postId());
  }

  loadMore(): void {
    this.commentsService.loadMore(this.postId());
  }

  onDelete(commentId: string): void {
    this.commentsService.deleteComment(commentId);
  }

  canDelete(comment: CommentRow): boolean {
    const currentUser = this.authService.currentUser();
    return (
      !comment.pendingSync &&
      (comment.authorId === currentUser?.id || this.postAuthorId() === currentUser?.id)
    );
  }

  async openCommentInput(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: CommentInputComponent });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<{ content: string }>();
    if (role !== 'cancel' && data?.content) {
      this.commentsService.addComment(this.postId(), data.content);
    }
  }
}
