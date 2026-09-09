import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';
import { AuthService } from '../../../auth/auth.service';
import { ConnectivityService } from '../../../../core/network/connectivity.service';
import { AvatarPickerComponent } from '../../../../shared/components/avatar-picker/avatar-picker.component';
import { UsersService } from '../../users.service';

addIcons({ 'person-circle-outline': personCircleOutline });

/**
 * Same kind of client-side sanity check as `RegisterPage`'s `displayName`
 * field (`Validators.minLength(2)`): catches an empty-ish name before a
 * round trip to the backend, not a substitute for whatever the backend
 * itself enforces.
 */
const MIN_DISPLAY_NAME_LENGTH = 2;

/**
 * README's Screens table entry for this branch: "Update display name and
 * avatar" (Owner only). Unlike `ProfilePage`, which can render *any*
 * user's profile via its `:id` route param, this page only ever edits the
 * signed-in user's own profile: the form is pre-filled from
 * `AuthService.currentUser()`, not from `UsersService.user()` (which could
 * be showing someone else's profile if the user navigated here from a
 * different profile page). See `users.routes.ts` for the routing decision
 * this implies: the `:id` segment this page is nested under is not read
 * by this component at all.
 *
 * Per the API Contract, `PATCH /users/me` only accepts `displayName`;
 * email is not editable anywhere in this app, and the avatar has its own
 * dedicated upload endpoint, handled entirely by `AvatarPickerComponent`
 * rather than folded into this form.
 *
 * A successful `displayName`/avatar update refreshes `UsersService.user`
 * (in the `displayName` case, only if that signal happens to already be
 * showing this same account), this page's own local avatar preview, and
 * `AuthService.currentUser` via `updateCurrentUser()`, so anything reading
 * the signed-in user's name/avatar elsewhere in the app reflects the edit
 * immediately rather than only after the next sign-in.
 */
@Component({
  selector: 'app-edit-profile-page',
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
    IonButton,
    IonIcon,
    IonToast,
    AvatarPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edit-profile.page.html',
  styleUrl: './edit-profile.page.scss',
})
export class EditProfilePage {
  private readonly authService = inject(AuthService);
  private readonly usersService = inject(UsersService);
  private readonly connectivityService = inject(ConnectivityService);
  private readonly fb = inject(FormBuilder);

  readonly isOnline = this.connectivityService.isOnline;

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(MIN_DISPLAY_NAME_LENGTH)]],
  });

  get displayNameControl() {
    return this.form.controls.displayName;
  }

  /** Mirrors `LoginPage`/`RegisterPage`'s `submitted` flag: lets the
   * validation summary show even for a submit-while-empty tap that never
   * individually touched the field. */
  readonly submitted = signal(false);

  readonly isSubmitting = computed(() => this.usersService.profileUpdate().status === 'loading');

  readonly canSubmit = computed(() => this.isOnline() && !this.isSubmitting());

  /**
   * `UsersService.profileUpdate` is a single signal shared by whatever the
   * last `updateProfile()` call anywhere in the app was (there is exactly
   * one `UsersService` instance). Without this flag, mounting this page
   * right after a stale `error`/`success` was left behind by some earlier
   * call would immediately pop this page's toast for a submission it never
   * made. `UsersService` has no `resetState()` equivalent to `AuthService`'s
   * (out of this page's scope to add), so this local flag does the same
   * job from the page's side instead: the toast-driving effect below stays
   * quiet until this page's own `onSubmit()` actually runs.
   */
  private readonly hasSubmittedHere = signal(false);

  /** Local preview of the avatar shown next to the picker, seeded from
   * `AuthService.currentUser()` and updated in place the moment
   * `AvatarPickerComponent` reports a successful upload, so this page does
   * not have to wait on a full profile reload to reflect it. */
  private readonly avatarPreview = signal<string | null>(this.authService.currentUser()?.photoUrl ?? null);
  readonly avatarPhotoUrl = this.avatarPreview.asReadonly();

  // See LoginPage's toastOpen/toastMessage comment for why these are plain
  // local signals rather than a computed() derived straight from a facade
  // state signal.
  readonly toastOpen = signal(false);
  readonly toastMessage = signal('');
  readonly toastColor = signal<'success' | 'danger'>('success');

  constructor() {
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.form.patchValue({ displayName: currentUser.displayName });
    }

    effect(() => {
      const state = this.usersService.profileUpdate();
      if (!this.hasSubmittedHere()) {
        return;
      }
      if (state.status === 'success') {
        this.toastColor.set('success');
        this.toastMessage.set('Profile updated.');
        this.toastOpen.set(true);
        void this.authService.updateCurrentUser(state.data);
        return;
      }
      if (state.status === 'error') {
        this.toastColor.set('danger');
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

    this.hasSubmittedHere.set(true);
    const { displayName } = this.form.getRawValue();
    this.usersService.updateProfile(displayName);
  }

  /**
   * `AvatarPickerComponent` already updated the server (and its own
   * internal state) by the time this fires; the only thing left for this
   * page to do is reflect the result. The preview updates immediately from
   * the event itself (the server's own response, not a guess), and
   * `loadUser` is called so `UsersService.user` (what `ProfilePage` reads)
   * picks up the new avatar too, in case the user navigates back there in
   * this same session rather than reloading the app.
   */
  onAvatarUploaded(event: { photoUrl: string }): void {
    this.avatarPreview.set(event.photoUrl);
    this.toastColor.set('success');
    this.toastMessage.set('Avatar updated.');
    this.toastOpen.set(true);

    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.usersService.loadUser(currentUser.id);
      void this.authService.updateCurrentUser({ ...currentUser, photoUrl: event.photoUrl });
    }
  }

  onToastDismiss(): void {
    this.toastOpen.set(false);
  }
}
