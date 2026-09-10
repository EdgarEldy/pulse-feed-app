import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { IonButton, IonIcon, IonProgressBar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cameraOutline } from 'ionicons/icons';
import { AppError } from '../../../core/models/app-error';
import { UsersService } from '../../../features/users/users.service';
import { ErrorViewComponent } from '../error-view/error-view.component';
import { fileFromUri } from '../../utils/blob-file.util';

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
  private readonly destroyRef = inject(DestroyRef);

  /** Emitted once, with the server's response, right after a successful upload. */
  @Output() uploaded = new EventEmitter<{ photoUrl: string }>();

  private readonly pickerState = signal<AvatarPickerState>({ status: 'idle' });
  readonly state = this.pickerState.asReadonly();

  async pickAndUpload(): Promise<void> {
    const photo = await this.promptForPhoto();
    if (!photo) {
      // The user backed out of the native picker, or denied camera/photo
      // permission. `Camera.getPhoto` itself is the only step in this flow
      // Capacitor documents as rejecting for that reason; there is nothing
      // to upload and nothing worth surfacing as an app error, so this
      // simply leaves the picker idle.
      return;
    }

    let file: File;
    try {
      file = await this.toFile(photo);
    } catch (error) {
      // Unlike a cancelled picker, a failure past this point (no webPath,
      // fetch/blob conversion failing) means the user *did* pick something
      // and it genuinely could not be turned into an uploadable file. That
      // is a real problem this component's error state exists to surface,
      // not a silent no-op.
      this.pickerState.set({
        status: 'error',
        error: { kind: 'validation', message: error instanceof Error ? error.message : 'Could not read the picked photo.' },
      });
      return;
    }

    this.pickerState.set({ status: 'uploading', progress: 0 });
    // Without this, navigating away (or EditProfilePage being destroyed)
    // before the upload finishes would leave this subscription running in
    // the background; its callback would still fire on an already-
    // destroyed component instance, emitting `uploaded` and triggering
    // whatever side effects a parent hooked to it after the user has left.
    this.usersService.uploadAvatar(file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
   * `CameraSource.Prompt` is what makes this a single entry point that asks
   * the user to choose between the camera and their photo gallery, rather
   * than this component committing to one or the other upfront. Capacitor's
   * documented behavior is that this call *rejects* when the user cancels
   * out of that prompt or denies permission, with no separate resolved
   * "nothing picked" value, so that is the one call in this whole flow
   * whose rejection this component treats as a non-error, returning `null`
   * instead of throwing.
   */
  private async promptForPhoto(): Promise<Photo | null> {
    try {
      return await Camera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        quality: 80,
      });
    } catch {
      return null;
    }
  }

  /**
   * `webPath` is a path Capacitor makes readable the same way on the web
   * build and inside the native WebView, which `fileFromUri` turns into the
   * `File` `UsersApiService.uploadAvatar` builds its multipart body from.
   * Every rejection here is a genuine failure, unlike `promptForPhoto()`'s
   * cancellation case, so this lets them propagate rather than swallowing
   * them.
   */
  private async toFile(photo: Photo): Promise<File> {
    if (!photo.webPath) {
      throw new Error('Camera did not return a usable image path.');
    }
    return fileFromUri(photo.webPath, 'avatar', photo.format);
  }
}
