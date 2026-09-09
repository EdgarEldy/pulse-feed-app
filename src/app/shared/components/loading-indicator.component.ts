import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonSpinner } from '@ionic/angular/standalone';

/**
 * A small, reusable loading state, wrapping `ion-spinner` so every feature
 * shows the exact same "loading" affordance (spinner style, spacing,
 * centering) instead of each page inventing its own markup for it.
 *
 * `ion-spinner` itself is purely visual and conveys nothing to assistive
 * technology, so the wrapping element carries `role="status"` plus an
 * `aria-label` built from `label` (this is the ARIA convention this design
 * system follows for icon/spinner-only content: never rely on the graphic
 * alone, always give it an explicit accessible name). `aria-live="polite"`
 * lets a screen reader announce it without interrupting whatever the user
 * was already doing.
 */
@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  imports: [IonSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="loading-indicator"
      role="status"
      aria-live="polite"
      [attr.aria-label]="label || 'Loading'"
    >
      <ion-spinner name="crescent" aria-hidden="true"></ion-spinner>
    </div>
  `,
  styles: [
    `
      .loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--app-space-lg);
      }
    `,
  ],
})
export class LoadingIndicatorComponent {
  @Input() label = '';
}
