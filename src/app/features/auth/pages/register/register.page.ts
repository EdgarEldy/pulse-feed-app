import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AuthService } from '../../auth.service';

/** Same client-side sanity-check length as `LoginPage`; see that file's
 * comment on `MIN_PASSWORD_LENGTH` for why this stays a client-side hint
 * rather than the actual password policy. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Email/password sign-up, per README's Screens table for this branch.
 * Structurally a near-twin of `LoginPage` (same `authState`-driven
 * loading/error handling, same success-navigates-to-`/feed` behavior),
 * plus a `displayName` field `POST /auth/register` requires per the API
 * Contract. Kept as its own component rather than a shared form, so each
 * page's field set and copy can diverge freely later without the two
 * fighting over a shared abstraction for what is currently a small overlap.
 */
@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonToast,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  get displayNameControl() {
    return this.form.controls.displayName;
  }

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  readonly submitted = signal(false);

  readonly isSubmitting = computed(() => this.authService.authState().status === 'loading');

  // See LoginPage's toastOpen/toastMessage comment for why these are plain
  // local signals rather than a computed() derived straight from authState.
  readonly toastOpen = signal(false);
  readonly toastMessage = signal('');

  constructor() {
    // See LoginPage's constructor comment: clears any state left behind by
    // a previous attempt on either auth page before this page's own effect
    // starts reacting to it.
    this.authService.resetState();

    effect(() => {
      const state = this.authService.authState();
      if (state.status === 'error') {
        this.toastMessage.set(state.error.message);
        this.toastOpen.set(true);
        return;
      }
      if (state.status === 'success') {
        this.router.navigateByUrl('/feed');
      }
    });
  }

  onSubmit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password, displayName } = this.form.getRawValue();
    this.authService.register(email, password, displayName);
  }

  onToastDismiss(): void {
    this.toastOpen.set(false);
  }
}
