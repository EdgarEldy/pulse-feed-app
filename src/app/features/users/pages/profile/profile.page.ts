import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { personCircleOutline } from 'ionicons/icons';
import { ErrorViewComponent } from '../../../../shared/components/error-view/error-view.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { UsersService } from '../../users.service';

addIcons({ 'person-circle-outline': personCircleOutline });

/**
 * README's Screens table entry for this branch: "View own or another
 * user's profile and their posts" (Authenticated). This page renders
 * whichever profile `UsersService.user` currently holds; it never assumes
 * that is the signed-in user's own account. Editing (`EditProfilePage`, a
 * parallel task on this branch) is a separate route reached from here for
 * the profile's owner, not handled by this page.
 *
 * "the user's posts" from the Screens table cannot be built yet:
 * `feature/posts` (a later branch) does not exist on this branch. A short
 * "Posts coming soon" placeholder stands in for that section instead of a
 * fake list, so nothing here has to be thrown away once `feature/posts`
 * lands and this page can render a real list in its place.
 */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [IonContent, IonHeader, IonTitle, IonToolbar, IonIcon, LoadingIndicatorComponent, ErrorViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.scss',
})
export class ProfilePage {
  private readonly usersService = inject(UsersService);

  /**
   * A signal input, deliberately not the `@Input() id!: string` decorator
   * form: `withComponentInputBinding()` (already configured in
   * `app.config.ts`) binds this from the `:id` route parameter either way,
   * but only a signal input is itself trackable by the `effect()` below.
   * Angular reuses this component instance, rather than destroying and
   * recreating it, when navigating in place from one `/profile/:id` to
   * another (e.g. tapping a different author's name while already on a
   * profile page), so a plain class field read inside `effect()` would
   * only ever see the value it had the moment the effect first ran; a
   * signal input correctly notifies the effect of every subsequent change.
   */
  readonly id = input.required<string>();

  readonly user = this.usersService.user;

  constructor() {
    effect(() => {
      this.usersService.loadUser(this.id());
    });
  }

  onRetry(): void {
    this.usersService.loadUser(this.id());
  }
}
