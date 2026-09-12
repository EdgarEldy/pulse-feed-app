import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonSpinner } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

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
  imports: [IonSpinner, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-indicator.component.html',
  styleUrl: './loading-indicator.component.scss',
})
export class LoadingIndicatorComponent {
  @Input() label = '';
}
