import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, cloudOfflineOutline } from 'ionicons/icons';
import { TranslatePipe } from '@ngx-translate/core';

addIcons({ 'cloud-offline-outline': cloudOfflineOutline, 'close-outline': closeOutline });

/**
 * Design-system-wide ARIA convention: any `ion-button`/`button` whose only
 * content is an `ion-icon` (no visible text alongside it) must carry an
 * explicit `aria-label` describing what the action does. A screen reader
 * has nothing else to announce for a bare icon, and the icon's asset name
 * ("close-outline") is an implementation detail, not a description of the
 * action. Every shared component in `shared/components/` follows this
 * rule from the start; later branches adding their own icon-only buttons
 * (like buttons, delete buttons, camera buttons...) should follow it too.
 * The dismiss control below is the reference example: it is icon-only, so
 * it carries `aria-label="Dismiss offline notice"`.
 */
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [IonIcon, IonButton, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOffline) {
      <div class="offline-banner" role="status">
        <ion-icon name="cloud-offline-outline" aria-hidden="true"></ion-icon>
        <span class="offline-banner__text">{{ 'offlineBanner.message' | translate }}</span>
        <!--
          Not functionally dismissible yet, disabled on purpose so it does
          not mislead a screen reader into thinking a tap actually hides
          the banner. feature/offline-and-sync's ConnectivityService will
          drive isOffline for real and can wire this up then.
        -->
        <ion-button
          fill="clear"
          size="small"
          disabled
          [attr.aria-label]="'offlineBanner.dismiss' | translate"
        >
          <ion-icon slot="icon-only" name="close-outline" aria-hidden="true"></ion-icon>
        </ion-button>
      </div>
    }
  `,
  styles: [
    `
      .offline-banner {
        display: flex;
        align-items: center;
        gap: var(--app-space-sm);
        padding: var(--app-space-sm) var(--app-space-md);
        background: var(--ion-color-warning);
        color: var(--ion-color-warning-contrast);
        border-radius: var(--app-radius);
      }

      .offline-banner__text {
        flex: 1;
      }
    `,
  ],
})
export class OfflineBannerComponent {
  // Plain boolean input for now. feature/offline-and-sync's
  // ConnectivityService will replace this manual binding by driving
  // isOffline from real connectivity state (e.g. `!connectivity.isOnline()`)
  // wherever this component is used.
  @Input() isOffline = false;
}
