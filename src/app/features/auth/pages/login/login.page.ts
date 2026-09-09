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

/**
 * Minimum password length enforced client-side, purely to catch an
 * obviously-too-short attempt before a round trip to the backend, which
 * remains the actual authority on password policy (hashing rules, breach
 * lists, whatever else it decides to enforce). 8 characters is a common,
 * unopinionated baseline for this kind of client-side sanity check; nothing
 * in the API Contract dictates a different number.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Email/password sign-in, per README's Screens table for this branch. The
 * only thing this page owns is the form and how `AuthService.authState`
 * gets turned into UI: it never talks to `AuthApiService` or touches
 * storage itself, it just calls `AuthService.signIn(...)` and reacts to
 * the facade's state.
 */
@Component({
  selector: 'app-login-page',
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
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)]],
  });

  get emailControl() {
    return this.form.controls.email;
  }

  get passwordControl() {
    return this.form.controls.password;
  }

  /** Whether the user has attempted to submit at least once, so a validation
   * summary can show even for fields that were never individually touched
   * (a click straight on "Sign in" with every field still blank never blurs
   * anything, so `touched` alone would never flip to `true`). */
  readonly submitted = signal(false);

  readonly isSubmitting = computed(() => this.authService.authState().status === 'loading');

  /**
   * `ion-toast`'s `isOpen`/`message` are backed by these two local signals
   * rather than bound directly to a `computed()` over `AuthService.authState`.
   * A `computed` signal only ever reflects its source: if `isOpen` were
   * `computed(() => authState().status === 'error')`, dismissing the toast
   * (a swipe, or the auto `duration` timeout) would have no way to turn
   * `isOpen` back off, since nothing wrote to `authState` when that
   * happened, and the computed signal would just recompute back to `true`.
   * A local `signal` can be set directly from `(didDismiss)`, independent
   * of whatever `authState` currently holds, while an `effect()` is still
   * what raises it back to `true` (and refreshes the message) the moment a
   * new sign-in attempt actually fails.
   */
  readonly toastOpen = signal(false);
  readonly toastMessage = signal('');

  constructor() {
    // Clears any error/success left behind by a previous attempt on this
    // or the other auth page, so the effect below starts reacting from a
    // known idle state rather than possibly showing a stale toast the
    // instant this page mounts.
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

    const { email, password } = this.form.getRawValue();
    this.authService.signIn(email, password);
  }

  onToastDismiss(): void {
    this.toastOpen.set(false);
  }
}
