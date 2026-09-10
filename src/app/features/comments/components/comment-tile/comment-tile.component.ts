import { ChangeDetectionStrategy, Component, EventEmitter, Output, input } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { syncOutline, trashOutline } from 'ionicons/icons';
import { CachedImageDirective } from '../../../../shared/directives/cached-image.directive';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { CommentRow } from '../../comment.model';

addIcons({ 'trash-outline': trashOutline, 'sync-outline': syncOutline });

@Component({
  selector: 'app-comment-tile',
  standalone: true,
  imports: [IonButton, IonIcon, CachedImageDirective, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comment-tile.component.html',
  styleUrl: './comment-tile.component.scss',
})
export class CommentTileComponent {
  readonly comment = input.required<CommentRow>();
  readonly canDelete = input(false);

  @Output() readonly delete = new EventEmitter<void>();

  onDelete(): void {
    this.delete.emit();
  }
}
