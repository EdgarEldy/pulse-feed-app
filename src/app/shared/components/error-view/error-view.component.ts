import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline, refreshOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';
import { AppError, AppErrorKind } from '../../../core/models/app-error';

addIcons({ 'alert-circle-outline': alertCircleOutline, 'refresh-outline': refreshOutline });

// Icon-only ion-button/button ARIA convention (see also offline-banner.component.ts
// for the fuller note): every ion-button/button whose only content is an
// ion-icon must carry an explicit aria-label describing the action, never
// rely on the icon alone to convey it. The "Try again" button below has
// visible text alongside its icon, so it is exempt from that rule, but the
// convention still applies to every icon-only control across this design
// system.
const ERROR_MESSAGE_KEYS: Record<AppErrorKind, string> = {
  network: 'errors.network',
  unauthorized: 'errors.unauthorized',
  server: 'errors.server',
  cache: 'errors.cache',
  validation: 'errors.validation',
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
  imports: [IonButton, IonIcon, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-view.component.html',
  styleUrl: './error-view.component.scss',
})
export class ErrorViewComponent {
  @Input({ required: true }) error!: AppError;

  // Callers that don't care about retrying can simply ignore this output;
  // the button is always rendered so the affordance is consistent
  // everywhere this component is used.
  @Output() retry = new EventEmitter<void>();

  get messageKey(): string {
    return ERROR_MESSAGE_KEYS[this.error.kind];
  }
}
