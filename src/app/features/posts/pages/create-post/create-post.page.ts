import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonProgressBar,
  IonTextarea,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle, imageOutline } from 'ionicons/icons';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PostsService } from '../../posts.service';

addIcons({ 'image-outline': imageOutline, 'close-circle': closeCircle });

/**
 * README's Screens table entry for this branch: "Title, content, optional
 * image". Reachable at both `/feed/create` and `/posts/create` (see
 * `posts.routes.ts`), since `app.routes.ts` mounts the same `POSTS_ROUTES`
 * children under both `feed` and `posts`.
 *
 * This page only ever collects a title, content, and, optionally, a locally
 * picked photo's `webPath`; it never builds a `File`/multipart body itself.
 * `PostsApiService.createPost` is what turns `imageUri` into an actual file
 * at request time, both for a live submission and for one replayed later
 * from the offline sync queue, which is exactly why this page passes the
 * raw local URI through rather than pre-converting it.
 */
@Component({
  selector: 'app-create-post-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonButton,
    IonIcon,
    IonProgressBar,
    IonToast,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-post.page.html',
  styleUrl: './create-post.page.scss',
})
export class CreatePostPage {
  private readonly postsService = inject(PostsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    content: ['', [Validators.required]],
  });

  get titleControl() {
    return this.form.controls.title;
  }

  get contentControl() {
    return this.form.controls.content;
  }

  /** Mirrors `LoginPage`/`EditProfilePage`'s `submitted` flag: lets the
   * validation summary show even for a submit-while-empty tap that never
   * individually touched a field. */
  readonly submitted = signal(false);

  /** The picked photo's local file URI (`Photo.webPath`), or `null` when no
   * image has been picked (or the user removed the one they picked). */
  readonly pickedImageUri = signal<string | null>(null);

  /** Exposed for the template's progress bar; `null` while idle, `0`-`100` while a create is uploading. */
  readonly createProgress = this.postsService.createProgress;

  readonly isUploading = computed(() => this.createProgress() !== null);

  readonly canSubmit = computed(() => !this.isUploading());

  // See LoginPage's toastOpen/toastMessage comment for why these are plain
  // local signals rather than a computed() derived straight from a facade
  // state signal: a toast needs to be dismissible independently of whatever
  // `postsService.posts()` currently holds.
  readonly toastOpen = signal(false);
  readonly toastMessage = signal('');

  /**
   * `true` from the moment `onSubmit()` calls `createPost()` until the
   * effect below has resolved that call one way or another. Without this
   * guard, the effect would also react to whatever `posts` state this page
   * happened to mount with (e.g. `FeedPage` was left in a stale `error`
   * state from an earlier, unrelated failure), navigating away or popping a
   * toast for a submission this page never made.
   */
  private readonly awaitingResult = signal(false);

  /**
   * `posts().data[0]`'s `id` (or `null` when `posts()` was not even in
   * `success` yet) captured right before this page's own `createPost()`
   * call. `PostsService.createPost` is fire-and-forget: it never returns an
   * `Observable`/`Promise` this page could await, and there is no dedicated
   * "did my call succeed" signal beyond watching `posts()` itself change.
   * Comparing the new first id against this snapshot, rather than just
   * checking `status === 'success'`, is what tells this page a *new* post
   * actually landed at the front, as opposed to `posts()` merely being in
   * `success` already for an unrelated reason (a `loadMore()` finishing in
   * the background, for instance).
   */
  private readonly baselineFirstId = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (!this.awaitingResult()) {
        return;
      }
      const state = this.postsService.posts();

      if (state.status === 'success') {
        const newFirstId = state.data[0]?.id ?? null;
        if (newFirstId !== null && newFirstId !== this.baselineFirstId()) {
          // A real success, whether the write reached the server
          // immediately or was queued and shown optimistically with
          // `pendingSync: true`: `PostsService.createPost` updates `posts()`
          // the same way in both cases, so this page does not need to know
          // which one happened.
          this.awaitingResult.set(false);
          this.router.navigateByUrl('/feed');
        }
        return;
      }

      if (state.status === 'error') {
        if (state.error.kind === 'network') {
          // `PostsService` queued this write optimistically instead of
          // surfacing it as a failure; from this page's point of view that
          // is success, not something to show an error for. The `success`
          // branch above is what actually fires the navigation once the
          // optimistic row lands in `posts()`.
          return;
        }
        this.awaitingResult.set(false);
        this.toastMessage.set(state.error.message);
        this.toastOpen.set(true);
      }
    });
  }

  onSubmit(): void {
    this.submitted.set(true);
    if (this.form.invalid || !this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const currentPosts = this.postsService.posts();
    this.baselineFirstId.set(currentPosts.status === 'success' ? (currentPosts.data[0]?.id ?? null) : null);
    this.awaitingResult.set(true);

    const { title, content } = this.form.getRawValue();
    this.postsService.createPost({
      title,
      content,
      imageUri: this.pickedImageUri() ?? undefined,
    });
  }

  async pickImage(): Promise<void> {
    const photo = await this.promptForPhoto();
    if (!photo) {
      // The user backed out of the native picker, or denied camera/photo
      // permission. `Camera.getPhoto` rejects for that reason, with no
      // separate resolved "nothing picked" value, so that rejection is
      // treated as a non-error here, same as `AvatarPickerComponent`.
      return;
    }
    if (!photo.webPath) {
      this.toastMessage.set(this.translate.instant('createPost.photoReadError'));
      this.toastOpen.set(true);
      return;
    }
    this.pickedImageUri.set(photo.webPath);
  }

  removeImage(): void {
    this.pickedImageUri.set(null);
  }

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

  onToastDismiss(): void {
    this.toastOpen.set(false);
  }
}
