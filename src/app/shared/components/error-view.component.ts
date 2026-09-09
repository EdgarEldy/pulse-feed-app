import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, refreshOutline } from 'ionicons/icons';
import { AppError, AppErrorKind } from '../../core/models/app-error';

addIcons({ 'alert-circle-outline': alertCircleOutline, 'refresh-outline': refreshOutline });

// Icon-only ion-button/button ARIA convention (see also offline-banner.component.ts
// for the fuller note): every ion-button/button whose only content is an
// ion-icon must carry an explicit aria-label describing the action, never
// rely on the icon alone to convey it. The "Try again" button below has
// visible text alongside its icon, so it is exempt from that rule, but the
// convention still applies to every icon-only control across this design
// system.
const ERROR_MESSAGES: Record<AppErrorKind, string> = {
  network: "You're offline. Check your connection and try again.",
  unauthorized: 'Your session has expired. Please sign in again.',
  server: 'Something went wrong on our end. Please try again shortly.',
  cache: "We couldn't load the saved data on this device.",
  validation: 'The server sent back something unexpected. Please try again.',
};

/**
 * Renders a message for a facade service's `error` state.
 *
 * This branches on `AppError.kind` rather than displaying `error.message`
 * verbatim: `message` is whatever text the backend (or the generic
 * fallback in `http-error.util.ts`) happened to produce, while the copy
 * here is written for the situation the user is actually in. "You're
 * offline" reads very differently from "the server is down", even though
 * both could arrive as the same generic message string, and keeping the
 * mapping here means every feature that reuses this component shows
 * consistent, purpose-written copy instead of raw error text.
 */
@Component({
  selector: 'app-error-view',
  standalone: true,
  imports: [IonButton, IonIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-view">
      <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
      <p class="error-view__message">{{ message }}</p>
      <ion-button fill="outline" size="small" (click)="retry.emit()">
        <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
        Try again
      </ion-button>
    </div>
  `,
  styles: [
    `
      .error-view {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--app-space-sm);
        padding: var(--app-space-lg);
        text-align: center;
      }

      .error-view__message {
        margin: 0;
        color: var(--ion-color-medium);
      }

      ion-icon[name='alert-circle-outline'] {
        font-size: 2rem;
        color: var(--ion-color-danger);
      }
    `,
  ],
})
export class ErrorViewComponent {
  @Input({ required: true }) error!: AppError;

  // Callers that don't care about retrying can simply ignore this output;
  // the button is always rendered so the affordance is consistent
  // everywhere this component is used.
  @Output() retry = new EventEmitter<void>();

  get message(): string {
    return ERROR_MESSAGES[this.error.kind];
  }
}
