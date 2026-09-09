import { Injectable, Signal, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { UploadEvent } from '../../core/http/base-api.service';
import { AppError } from '../../core/models/app-error';
import { UsersApiService } from './users-api.service';
import { User } from './user.model';

/**
 * Same `idle`/`loading`/`error`/`success` discriminated union README's
 * Error Handling section establishes, reused for both signals this
 * facade exposes (see `user`/`profileUpdate` below). Per the Offline
 * scope table, profile reads/writes require connectivity and are never
 * cached or queued: a `network`-kind `AppError` lands in the `error`
 * branch exactly like any other failure kind, there is no cache fallback
 * branch to fall into.
 */
export type UsersState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: AppError } | { status: 'success'; data: User };

/**
 * Facade for `features/users`. `ProfilePage`, `EditProfilePage`, and
 * `AvatarPickerComponent` are the only things that should depend on this
 * service; none of them injects `UsersApiService` directly.
 *
 * Two independent pieces of state live here rather than one:
 *  - `user`: whichever profile was last loaded via `loadUser(id)`. This
 *    can be someone else's profile (viewing another user's page) just as
 *    easily as the current user's own.
 *  - `profileUpdate`: the state of the *last* `updateProfile` call, kept
 *    separate from `user` so `EditProfilePage` can show its own
 *    loading/error state without clobbering whatever `ProfilePage`
 *    (a different route, but the same singleton service) currently has
 *    loaded in `user`.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(UsersApiService);

  private readonly userState = signal<UsersState>({ status: 'idle' });
  readonly user: Signal<UsersState> = this.userState.asReadonly();

  private readonly updateState = signal<UsersState>({ status: 'idle' });
  readonly profileUpdate: Signal<UsersState> = this.updateState.asReadonly();

  loadUser(id: string): void {
    this.userState.set({ status: 'loading' });
    this.api.getUser(id).subscribe({
      next: (user) => this.userState.set({ status: 'success', data: user }),
      error: (error: AppError) => this.userState.set({ status: 'error', error }),
    });
  }

  /**
   * `PATCH /users/me` always targets the caller's own account (that's
   * what makes it `/me` rather than `/users/:id`), so the `User` it
   * returns is, by definition, the current user's fresh profile: no
   * separate lookup against `AuthService.currentUser` is needed to know
   * whose profile this update belongs to. If `user` happens to already
   * have that same account loaded (its `data.id` matches the response),
   * it is refreshed in place so `ProfilePage` reflects the edit
   * immediately without a second `loadUser` round trip; if `user` is
   * currently showing a *different* account's profile, it is left alone,
   * since this update has nothing to do with the profile being viewed.
   */
  updateProfile(displayName: string): void {
    this.updateState.set({ status: 'loading' });
    this.api.updateProfile(displayName).subscribe({
      next: (user) => {
        this.updateState.set({ status: 'success', data: user });
        const loaded = this.userState();
        if (loaded.status === 'success' && loaded.data.id === user.id) {
          this.userState.set({ status: 'success', data: user });
        }
      },
      error: (error: AppError) => this.updateState.set({ status: 'error', error }),
    });
  }

  /**
   * Returned directly rather than wrapped in a signal: `AvatarPickerComponent`
   * needs the full stream of progress events as they arrive to drive a
   * progress bar, which a signal (a single current value) would collapse
   * into just the latest one. The component subscribes itself and decides
   * what to do with each `UploadEvent`, including calling `updateProfile`-
   * style in-place refreshes of `user` once the final `photoUrl` arrives,
   * if it chooses to.
   */
  uploadAvatar(file: File): Observable<UploadEvent<{ photoUrl: string }>> {
    return this.api.uploadAvatar(file);
  }
}
