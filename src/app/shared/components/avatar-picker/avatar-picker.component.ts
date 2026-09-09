import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { IonButton, IonIcon, IonProgressBar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline } from 'ionicons/icons';
import { AppError } from '../../../core/models/app-error';
import { UsersService } from '../../../features/users/users.service';
import { ErrorViewComponent } from '../error-view/error-view.component';

addIcons({ 'camera-outline': cameraOutline });

/**
 * Idle/uploading/error states for the picker itself, separate from
 * `UsersService.user`/`profileUpdate`: this component drives its own
 * upload (see the class doc below for why), so it needs somewhere of its
 * own to track whether a photo is currently uploading and how far along.
 */
type AvatarPickerState = { status: 'idle' } | { status: 'uploading'; progress: number } | { status: 'error'; error: AppError };

/**
 * A reusable, self-contained "change my avatar" control. Tapping the
 * camera button prompts the user, through `@capacitor/camera`, to either
 * take a new photo or pick one from their gallery (`CameraSource.Prompt`),
 * then uploads whatever they picked via `UsersService.uploadAvatar`.
 *
 * This component owns the upload itself rather than just picking a photo
 * and emitting the `File` for some parent to upload, because it needs to
 * show upload *progress* as it happens: only whatever actually subscribes
 * to `UsersService.uploadAvatar`'s `Observable` sees each intermediate
 * `UploadEvent`, a caller further up the tree would only ever get to see
 * the final result, which is exactly what `uploaded` exists to pass along.
 *
 * Not wired into `ProfilePage` yet: avatar editing belongs to
 * `EditProfilePage`, a parallel task on this branch. `ProfilePage` only
 * ever displays the current avatar read-only.
 */
@Component({
  selector: 'app-avatar-picker',
  standalone: true,
  imports: [IonButton, IonIcon, IonProgressBar, ErrorViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-picker.component.html',
  styleUrl: './avatar-picker.component.scss',
})
export class AvatarPickerComponent {
  private readonly usersService = inject(UsersService);

  /** Emitted once, with the server's response, right after a successful upload. */
  @Output() uploaded = new EventEmitter<{ photoUrl: string }>();

  private readonly pickerState = signal<AvatarPickerState>({ status: 'idle' });
  readonly state = this.pickerState.asReadonly();

  async pickAndUpload(): Promise<void> {
    let file: File;
    try {
      file = await this.pickPhoto();
    } catch {
      // The user backed out of the native picker, or denied camera/photo
      // permission. There is nothing to upload and nothing worth
      // surfacing as an app error, so this simply leaves the picker idle.
      return;
    }

    this.pickerState.set({ status: 'uploading', progress: 0 });
    this.usersService.uploadAvatar(file).subscribe({
      next: (event) => {
        // `UploadEvent<T>` is `{ progress: number } | { progress: 100; result: T }`.
        // Checking for the `result` property (rather than `progress === 100`)
        // is what actually lets TypeScript narrow which branch of that union
        // this event is, since `progress` alone is typed as `number` on both.
        if ('result' in event) {
          this.pickerState.set({ status: 'idle' });
          this.uploaded.emit(event.result);
          return;
        }
        this.pickerState.set({ status: 'uploading', progress: event.progress });
      },
      error: (error: AppError) => this.pickerState.set({ status: 'error', error }),
    });
  }

  /**
   * `CameraResultType.Uri` returns a `webPath`: a path Capacitor makes
   * readable the same way on the web build and inside the native WebView,
   * which `fetch` can turn into a `Blob`, and from there into the `File`
   * `UsersApiService.uploadAvatar` builds its multipart body from.
   * `CameraSource.Prompt` is what makes this a single entry point that
   * asks the user to choose between the camera and their photo gallery,
   * rather than this component committing to one or the other upfront.
   */
  private async pickPhoto(): Promise<File> {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Prompt,
      quality: 80,
    });
    if (!photo.webPath) {
      throw new Error('Camera did not return a usable image path.');
    }
    const response = await fetch(photo.webPath);
    const blob = await response.blob();
    const extension = photo.format ?? 'jpeg';
    return new File([blob], `avatar.${extension}`, { type: blob.type });
  }
}
