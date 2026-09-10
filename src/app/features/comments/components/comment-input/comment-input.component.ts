import { AfterViewInit, ChangeDetectionStrategy, Component, ViewChild, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-comment-input',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonTextarea,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comment-input.component.html',
  styleUrl: './comment-input.component.scss',
})
export class CommentInputComponent implements AfterViewInit {
  @ViewChild('autoFocus') private readonly textarea!: IonTextarea;

  private readonly modal = inject(ModalController);

  readonly content = new FormControl('');

  ngAfterViewInit(): void {
    void this.textarea.setFocus();
  }

  async onClose(): Promise<void> {
    await this.modal.dismiss(null, 'cancel');
  }

  async onSubmit(): Promise<void> {
    const trimmed = (this.content.value ?? '').trim();
    if (!trimmed) {
      return;
    }
    this.content.setValue('');
    await this.modal.dismiss({ content: trimmed }, 'submit');
  }
}
